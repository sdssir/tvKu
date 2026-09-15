/**
 * Just enough ZIP reading to pull a subtitle file out of a SubDL archive:
 * the central directory, stored or deflated entries, nothing encrypted or
 * spanned. Inflation uses the browser's DecompressionStream, which Chromium
 * 132 on the TV has, so no library is needed.
 */

export interface ZipEntry {
  name: string
  size: number
}

const SIG_CENTRAL = 0x02014b50
const SIG_LOCAL = 0x04034b50
const SIG_END = 0x06054b50

interface Entry extends ZipEntry {
  method: number
  compressedSize: number
  localOffset: number
}

function readEntries(view: DataView): Entry[] {
  // End-of-central-directory record: fixed 22 bytes plus a comment of up to 64k.
  let end = -1
  for (let i = view.byteLength - 22; i >= Math.max(0, view.byteLength - 22 - 0xffff); i--) {
    if (view.getUint32(i, true) === SIG_END) {
      end = i
      break
    }
  }
  if (end < 0) throw new Error('Not a ZIP file')
  const count = view.getUint16(end + 10, true)
  let p = view.getUint32(end + 16, true)
  const entries: Entry[] = []
  const utf8 = new TextDecoder('utf-8')
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== SIG_CENTRAL) throw new Error('Corrupt ZIP directory')
    const method = view.getUint16(p + 10, true)
    const compressedSize = view.getUint32(p + 20, true)
    const size = view.getUint32(p + 24, true)
    const nameLen = view.getUint16(p + 28, true)
    const extraLen = view.getUint16(p + 30, true)
    const commentLen = view.getUint16(p + 32, true)
    const localOffset = view.getUint32(p + 42, true)
    const name = utf8.decode(new Uint8Array(view.buffer, view.byteOffset + p + 46, nameLen))
    entries.push({ name, size, method, compressedSize, localOffset })
    p += 46 + nameLen + extraLen + commentLen
  }
  return entries
}

export function listZip(buf: ArrayBuffer): ZipEntry[] {
  return readEntries(new DataView(buf)).map(({ name, size }) => ({ name, size }))
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

/** The bytes of one entry, by name. */
export async function readZipEntry(buf: ArrayBuffer, name: string): Promise<Uint8Array> {
  const view = new DataView(buf)
  const entry = readEntries(view).find((e) => e.name === name)
  if (!entry) throw new Error(`No "${name}" in ZIP`)
  const p = entry.localOffset
  if (view.getUint32(p, true) !== SIG_LOCAL) throw new Error('Corrupt ZIP entry')
  // The local header repeats the name and may carry a different extra field.
  const start = p + 30 + view.getUint16(p + 26, true) + view.getUint16(p + 28, true)
  const data = new Uint8Array(buf, start, entry.compressedSize)
  if (entry.method === 0) return data
  if (entry.method === 8) return inflateRaw(data)
  throw new Error(`Unsupported ZIP compression (${entry.method})`)
}

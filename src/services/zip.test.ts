import { deflateRawSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import { listZip, readZipEntry } from './zip'

/** Build a ZIP the way a normal archiver would: local headers, then a central directory. */
function makeZip(files: Array<{ name: string; data: string; store?: boolean }>): ArrayBuffer {
  const enc = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const u16 = (n: number) => [n & 0xff, (n >> 8) & 0xff]
  const u32 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >>> 24) & 0xff]
  for (const f of files) {
    const name = enc.encode(f.name)
    const raw = enc.encode(f.data)
    const body = f.store ? raw : new Uint8Array(deflateRawSync(raw))
    const method = f.store ? 0 : 8
    const local = new Uint8Array([
      ...u32(0x04034b50), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0), ...u32(0),
      ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(4), ...name, 1, 2, 3, 4, ...body,
    ])
    central.push(
      new Uint8Array([
        ...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0), ...u16(method), ...u16(0), ...u16(0), ...u32(0),
        ...u32(body.length), ...u32(raw.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0),
        ...u32(0), ...u32(offset), ...name,
      ]),
    )
    parts.push(local)
    offset += local.length
  }
  const cdStart = offset
  let cdLen = 0
  for (const c of central) {
    parts.push(c)
    cdLen += c.length
  }
  const comment = enc.encode('made by test')
  parts.push(
    new Uint8Array([
      ...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cdLen), ...u32(cdStart),
      ...u16(comment.length), ...comment,
    ]),
  )
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let p = 0
  for (const part of parts) {
    out.set(part, p)
    p += part.length
  }
  return out.buffer
}

const SRT = '1\n00:00:01,000 --> 00:00:02,000\nHello\n'

describe('zip', () => {
  it('lists the entries from the central directory', () => {
    const zip = makeZip([{ name: 'a.srt', data: SRT }, { name: 'readme.txt', data: 'x', store: true }])
    expect(listZip(zip)).toEqual([
      { name: 'a.srt', size: SRT.length },
      { name: 'readme.txt', size: 1 },
    ])
  })

  it('inflates a deflated entry and returns a stored one as-is', async () => {
    const zip = makeZip([{ name: 'a.srt', data: SRT }, { name: 'b.srt', data: SRT + '2', store: true }])
    expect(new TextDecoder().decode(await readZipEntry(zip, 'a.srt'))).toBe(SRT)
    expect(new TextDecoder().decode(await readZipEntry(zip, 'b.srt'))).toBe(SRT + '2')
  })

  it('rejects things that are not ZIPs', () => {
    expect(() => listZip(new TextEncoder().encode('not a zip at all, honestly').buffer as ArrayBuffer)).toThrow(/Not a ZIP/)
  })
})

import { ref } from 'vue'

export type Tone = 'info' | 'warn' | 'bad'

const message = ref<string | null>(null)
const tone = ref<Tone>('info')
let timer: ReturnType<typeof setTimeout> | null = null

/** Transient status line, one at a time; the newest replaces whatever is up. */
export function useToast() {
  function show(text: string, t: Tone = 'info', ms = 5000) {
    if (timer) clearTimeout(timer)
    message.value = text
    tone.value = t
    timer = setTimeout(() => (message.value = null), ms)
  }
  function hide() {
    if (timer) clearTimeout(timer)
    message.value = null
  }
  return { message, tone, show, hide }
}

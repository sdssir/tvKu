/** Human label for a decoded frame size, as the TV reports it. */
export function qualityLabel(w: number, h: number): string {
  const major = Math.max(w, h)
  if (major >= 3800) return '4K'
  if (major >= 1900) return '1080p'
  if (major >= 1260) return '720p'
  if (major > 0) return 'SD'
  return ''
}

/**
 * Rank a channel by the quality its provider claims in the name. Lower is
 * better; unknown sits between HD and SD so a plain name is not punished.
 */
export function nameQualityRank(name: string): number {
  if (/\b(4k|uhd|2160p?)\b/i.test(name)) return 0
  if (/\b(fhd|1080p?)\b/i.test(name)) return 1
  if (/\bhd\b/i.test(name)) return 2
  if (/\bsd\b/i.test(name)) return 4
  return 3
}

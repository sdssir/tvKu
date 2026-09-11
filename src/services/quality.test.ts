import { describe, expect, it } from 'vitest'
import { nameQualityRank, qualityLabel } from './quality'

describe('qualityLabel', () => {
  it('labels by the larger dimension so odd aspect ratios still read right', () => {
    expect(qualityLabel(3848, 2080)).toBe('4K')
    expect(qualityLabel(1920, 800)).toBe('1080p')
    expect(qualityLabel(1280, 720)).toBe('720p')
    expect(qualityLabel(960, 540)).toBe('SD')
    expect(qualityLabel(0, 0)).toBe('')
  })
})

describe('nameQualityRank', () => {
  it('orders 4K < FHD < HD < unknown < SD', () => {
    const names = ['[MY] TV3 SD', '[MY] TV3', '[MY] TV3 HD', '[MY] TV3 FHD', 'Loupe 4K (2160p)']
    const sorted = [...names].sort((a, b) => nameQualityRank(a) - nameQualityRank(b))
    expect(sorted).toEqual(['Loupe 4K (2160p)', '[MY] TV3 FHD', '[MY] TV3 HD', '[MY] TV3', '[MY] TV3 SD'])
  })
  it('does not mistake words containing hd for a tag', () => {
    expect(nameQualityRank('Hotel Transylvania')).toBe(3)
  })
})

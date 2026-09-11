import { describe, expect, it } from 'vitest'
import { cleanTitle, qualityScore } from './opensubtitles'

describe('cleanTitle', () => {
  it('removes panel decorations so the search matches the film', () => {
    expect(cleanTitle('Hotel Transylvania: Transformania (2022) 4k')).toBe('Hotel Transylvania: Transformania')
    expect(cleanTitle('The Marksman (2021)[BM]')).toBe('The Marksman')
    expect(cleanTitle('Sweet Home(eng)')).toBe('Sweet Home')
    expect(cleanTitle('Its Ok its Love(my)')).toBe('Its Ok its Love')
  })
})

describe('qualityScore', () => {
  const base = {
    fileId: 1,
    language: 'en',
    release: 'r',
    downloads: 0,
    hearingImpaired: false,
    matched: 'm',
    ratings: 0,
    votes: 0,
    fromTrusted: false,
    hd: false,
    autoTranslated: false,
    uploader: '',
  }

  it('sinks machine translations below anything human', () => {
    const auto = qualityScore({ ...base, autoTranslated: true, downloads: 999_999, fromTrusted: true })
    const human = qualityScore({ ...base, downloads: 1 })
    expect(auto).toBeLessThan(human)
  })

  it('treats an unrated file as unrated, not as rated zero', () => {
    // Both unrated; the more downloaded one wins on popularity alone.
    expect(qualityScore({ ...base, downloads: 10_000 })).toBeGreaterThan(qualityScore({ ...base, downloads: 100 }))
    // A genuinely rated file beats an unrated one with the same downloads.
    expect(qualityScore({ ...base, downloads: 100, ratings: 9, votes: 10 })).toBeGreaterThan(
      qualityScore({ ...base, downloads: 100 }),
    )
  })

  it('weights a rating by how many people voted', () => {
    const oneVote = qualityScore({ ...base, ratings: 10, votes: 1 })
    const manyVotes = qualityScore({ ...base, ratings: 10, votes: 10 })
    expect(manyVotes).toBeGreaterThan(oneVote)
  })

  it('prefers a trusted uploader over a moderately more popular stranger', () => {
    expect(qualityScore({ ...base, fromTrusted: true, downloads: 14_507 })).toBeGreaterThan(
      qualityScore({ ...base, downloads: 28_103 }),
    )
  })

  it('puts a plain file ahead of the same file marked hearing-impaired', () => {
    expect(qualityScore({ ...base, downloads: 100 })).toBeGreaterThan(
      qualityScore({ ...base, downloads: 100, hearingImpaired: true }),
    )
  })
})

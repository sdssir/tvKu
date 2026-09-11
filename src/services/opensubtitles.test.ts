import { describe, expect, it } from 'vitest'
import { cleanTitle } from './opensubtitles'

describe('cleanTitle', () => {
  it('removes panel decorations so the search matches the film', () => {
    expect(cleanTitle('Hotel Transylvania: Transformania (2022) 4k')).toBe('Hotel Transylvania: Transformania')
    expect(cleanTitle('The Marksman (2021)[BM]')).toBe('The Marksman')
    expect(cleanTitle('Sweet Home(eng)')).toBe('Sweet Home')
    expect(cleanTitle('Its Ok its Love(my)')).toBe('Its Ok its Love')
  })
})

import { describe, expect, it } from 'vitest'
import { dateBound, formatQuery, isEmptyQuery, parseQuery } from '../shared/search-query'

describe('parseQuery', () => {
  it('separates words from filters', () => {
    expect(parseQuery('kyoto temple tag:travel type:photos in:/Photos/2024/ after:2023 before:2025-06')).toEqual({
      words: ['kyoto', 'temple'],
      tags: ['travel'],
      types: ['image'],
      in: 'Photos/2024',
      after: '2023',
      before: '2025-06',
      problems: [],
    })
  })

  it('understands quotes in words and values', () => {
    const q = parseQuery('"annual report" tag:"two words" in:"Photos 2024"')
    expect(q).toMatchObject({ words: ['annual report'], tags: ['two words'], in: 'Photos 2024' })
  })

  it('combines repeated tags (AND) and types (OR), without duplicates', () => {
    expect(parseQuery('tag:a tag:B tag:b type:pdf type:image type:pdf')).toMatchObject({
      tags: ['a', 'B'],
      types: ['pdf', 'image'],
    })
  })

  it('keeps unknown prefixes as words and reports bad values', () => {
    const q = parseQuery('meeting 10:30 type:spreadsheet after:yesterday')
    expect(q.words).toEqual(['meeting', '10:30'])
    expect(q.problems).toHaveLength(2)
  })

  it('round-trips through formatQuery', () => {
    const text = 'kyoto tag:"two words" type:image in:"/Photos 2024" after:2023'
    expect(formatQuery(parseQuery(text))).toBe(text)
    expect(parseQuery(formatQuery(parseQuery(text)))).toEqual(parseQuery(text))
  })

  it('knows an empty query', () => {
    expect(isEmptyQuery(parseQuery('   '))).toBe(true)
    expect(isEmptyQuery(parseQuery('type:pdf'))).toBe(false)
  })
})

describe('dateBound', () => {
  it.each([
    ['2024', 'after', '2025-01-01'],
    ['2024-02', 'after', '2024-03-01'],
    ['2024-12-31', 'after', '2025-01-01'],
    ['2024', 'before', '2024-01-01'],
    ['2024-06', 'before', '2024-06-01'],
    ['2024-06-15', 'before', '2024-06-15'],
  ] as const)('%s %s', (value, side, expected) => {
    expect(dateBound(value, side).toISOString().slice(0, 10)).toBe(expected)
  })
})

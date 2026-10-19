import { describe, expect, it } from 'vitest'
import { parseRange } from '../server/utils/range'

describe('parseRange', () => {
  it.each([
    [undefined, null],
    ['bytes=0-99', { start: 0, end: 99 }],
    ['bytes=100-', { start: 100, end: 999 }],
    ['bytes=-100', { start: 900, end: 999 }],
    ['bytes=-5000', { start: 0, end: 999 }],
    ['bytes=900-5000', { start: 900, end: 999 }],
    ['bytes=1000-', 'unsatisfiable'],
    ['bytes=50-10', 'unsatisfiable'],
    ['bytes=-0', 'unsatisfiable'],
    ['bytes=0-1,5-9', null],
    ['items=0-1', null],
    ['bytes=-', null],
  ])('%s', (header, expected) => {
    expect(parseRange(header, 1000)).toEqual(expected)
  })
})

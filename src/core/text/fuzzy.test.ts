import { describe, expect, it } from 'vitest'

import { compareMatches, matchName, MatchRank, type NameMatch } from './fuzzy.ts'

function ranked(names: readonly string[], text: string): string[] {
  return names
    .flatMap((name) => {
      const match = matchName(name, text)
      return match === undefined ? [] : [{ name, match }]
    })
    .toSorted((first, second) => compareMatches(first.match, second.match))
    .map(({ name }) => name)
}

describe('matchName', () => {
  it('should find the text whole in the name first, whatever its case', () => {
    expect(matchName('CondominiumTransaction', ' TRANS ')).toStrictEqual({
      rank: MatchRank.Substring,
      start: 11,
      nameLength: 22,
      highlights: [[11, 16]],
    })
  })

  it('should find the characters in order, highlighting each run of them', () => {
    expect(matchName('Transaction', 'Trsa')).toStrictEqual({
      rank: MatchRank.Subsequence,
      start: 0,
      nameLength: 11,
      highlights: [
        [0, 2],
        [4, 6],
      ],
    })
    expect(matchName('xaxa', 'aa')?.highlights).toStrictEqual([
      [1, 2],
      [3, 4],
    ])
    expect(matchName('TransactionStatus', 'tnu')?.highlights).toStrictEqual([
      [0, 1],
      [3, 4],
      [15, 16],
    ])
  })

  it('should find the text over the starts of the words, of every kind of name', () => {
    expect(matchName('TransactionStatus', 'trst')).toStrictEqual({
      rank: MatchRank.WordStarts,
      start: 0,
      nameLength: 17,
      highlights: [
        [0, 2],
        [11, 13],
      ],
    })
    expect(matchName('order_line_item', 'oli')?.highlights).toStrictEqual([
      [0, 1],
      [6, 8],
    ])
    expect(matchName('order_line_item', 'olit')?.highlights).toStrictEqual([
      [0, 1],
      [6, 7],
      [11, 13],
    ])
    expect(matchName('my-order.items', 'oit')).toMatchObject({
      rank: MatchRank.WordStarts,
      start: 3,
    })
    expect(matchName('total$amount', 'tam')).toMatchObject({ rank: MatchRank.WordStarts })
    expect(matchName('customer orders', 'cor')).toMatchObject({
      rank: MatchRank.WordStarts,
      highlights: [
        [0, 1],
        [9, 11],
      ],
    })
  })

  it('should take the words in order, never one before the word it took', () => {
    expect(matchName('b_a_b', 'ab')).toStrictEqual({
      rank: MatchRank.WordStarts,
      start: 2,
      nameLength: 5,
      highlights: [
        [2, 3],
        [4, 5],
      ],
    })
  })

  it('should give back part of a word when the next words need it', () => {
    expect(matchName('ordersOrdinal', 'ordord')).toMatchObject({
      rank: MatchRank.WordStarts,
      highlights: [
        [0, 3],
        [6, 9],
      ],
    })
    expect(matchName('ab_x_bc', 'abc')).toMatchObject({
      rank: MatchRank.WordStarts,
      highlights: [
        [0, 1],
        [5, 7],
      ],
    })
  })

  it('should not start a word inside an upper case run or at a separator', () => {
    expect(matchName('HTTPLog', 'hl')?.rank).toBe(MatchRank.Subsequence)
    expect(matchName('ab__x', 'a_x')).toMatchObject({
      rank: MatchRank.Subsequence,
      highlights: [
        [0, 1],
        [2, 3],
        [4, 5],
      ],
    })
    expect(matchName('a__b', '_b')?.rank).toBe(MatchRank.Substring)
    expect(matchName('a_b_c', 'a_c')).toMatchObject({
      rank: MatchRank.WordStarts,
      highlights: [
        [0, 2],
        [4, 5],
      ],
    })
  })

  it('should match nothing for an empty text, or characters the name lacks or has out of order', () => {
    expect(matchName('orders', '  ')).toBeUndefined()
    expect(matchName('orders', 'ox')).toBeUndefined()
    expect(matchName('orders', 'so')).toBeUndefined()
    expect(matchName('', 'o')).toBeUndefined()
    expect(matchName('xa', 'aa')).toBeUndefined()
  })
})

describe('compareMatches', () => {
  const match = (changes: Partial<NameMatch>): NameMatch => ({
    rank: MatchRank.Substring,
    start: 0,
    nameLength: 5,
    highlights: [],
    ...changes,
  })

  it('should put the better match first: rank, then the earlier, then the shorter name', () => {
    expect(compareMatches(match({}), match({ rank: MatchRank.WordStarts }))).toBeLessThan(0)
    expect(compareMatches(match({ start: 1 }), match({}))).toBeGreaterThan(0)
    expect(compareMatches(match({ nameLength: 4 }), match({}))).toBeLessThan(0)
    expect(compareMatches(match({}), match({ highlights: [[0, 1]] }))).toBe(0)
  })

  it('should rank whole, then word starts, then characters in order', () => {
    expect(
      ranked(
        [
          'TransactionStatus',
          'old_trust',
          'tr_status',
          'trust',
          'Teams',
          'Transaction',
          'trst_log',
        ],
        'trst',
      ),
    ).toStrictEqual([
      'trst_log',
      'tr_status',
      'TransactionStatus',
      'trust',
      'Transaction',
      'old_trust',
    ])
    expect(ranked(['TransactionStatus', 'Transaction', 'Tag'], 'Trsa')).toStrictEqual([
      'Transaction',
      'TransactionStatus',
    ])
  })
})

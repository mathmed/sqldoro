import { describe, expect, it } from 'vitest'

import { compactCount, formatSize } from './quantities.ts'

describe('compactCount', () => {
  it.each([
    [0n, '0'],
    [7n, '7'],
    [10n, '10'],
    [999n, '999'],
    [1000n, '1k'],
    [1049n, '1k'],
    [1050n, '1.1k'],
    [1234n, '1.2k'],
    [9849n, '9.8k'],
    [9850n, '9.9k'],
    [9949n, '9.9k'],
    [9950n, '10k'],
    [27_412n, '27k'],
    [27_500n, '28k'],
    [999_499n, '999k'],
    [999_500n, '1M'],
    [1_234_567n, '1.2M'],
    [12_345_678n, '12M'],
    [1_000_000_000n, '1B'],
    [2_500_000_000_000n, '2.5T'],
    [5_000_000_000_000_000n, '5000T'],
  ])('should write %s as %s', (count, text) => {
    expect(compactCount(count)).toBe(text)
  })
})

describe('formatSize', () => {
  it.each([
    [0n, '0 B'],
    [1n, '1 B'],
    [512n, '512 B'],
    [1023n, '1023 B'],
    [1024n, '1 KB'],
    [1536n, '1.5 KB'],
    [10_188n, '9.9 KB'],
    [10_189n, '10 KB'],
    [983_040n, '960 KB'],
    [1_048_063n, '1023 KB'],
    [1_048_064n, '1 MB'],
    [33_554_432n, '32 MB'],
    [33_554_432n + 524_288n, '33 MB'],
    [33_554_432n + 524_287n, '32 MB'],
    [694_157_312n, '662 MB'],
    [2_147_483_648n, '2 GB'],
    [1_717_986_918n, '1.6 GB'],
    [1_099_511_627_776n, '1 TB'],
    [2n ** 50n, '1 PB'],
    [3n * 2n ** 60n, '3072 PB'],
  ])('should write %s bytes as %s', (bytes, text) => {
    expect(formatSize(bytes)).toBe(text)
  })
})

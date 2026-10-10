// Exact comparison of numbers written as text: BIGINT and DECIMAL values are compared digit by
// digit, never through a floating point number that would round them.
interface Decimal {
  readonly sign: number
  // Significant digits without leading or trailing zeros; empty for zero.
  readonly digits: string
  // The value is 0.<digits> times 10 to this power.
  readonly exponent: number
}

// Text that is not a finite decimal is ordered like PostgreSQL orders it: -Infinity first, then the
// numbers, Infinity and NaN; anything else comes last, by its text.
const NEGATIVE_INFINITY_RANK = -1
const FINITE_RANK = 0
const INFINITY_RANK = 1
const NAN_RANK = 2
const UNKNOWN_RANK = 3
const SPECIAL_RANKS: ReadonlyMap<string, number> = new Map([
  ['-infinity', NEGATIVE_INFINITY_RANK],
  ['infinity', INFINITY_RANK],
  ['nan', NAN_RANK],
])
const MAX_MANTISSA_PARTS = 2
const DIGITS = /^\d*$/
const EXPONENT = /^[+-]?\d+$/
const SIGN = /^[+-]/
const LEADING_ZEROS = /^0+/
const ZERO: Decimal = { sign: 0, digits: '', exponent: 0 }

export interface NumericKey {
  readonly rank: number
  readonly decimal: Decimal
  readonly text: string
}

export function numericKey(value: number | string): NumericKey {
  const text = String(value)
  const decimal = parseDecimal(text)
  if (decimal !== undefined) {
    return { rank: FINITE_RANK, decimal, text }
  }
  return { rank: SPECIAL_RANKS.get(text.toLowerCase()) ?? UNKNOWN_RANK, decimal: ZERO, text }
}

export function compareNumericKeys(left: NumericKey, right: NumericKey): number {
  if (left.rank !== right.rank) {
    return Math.sign(left.rank - right.rank)
  }
  if (left.rank === UNKNOWN_RANK) {
    return compareText(left.text, right.text)
  }
  return compareDecimals(left.decimal, right.decimal)
}

function compareText(left: string, right: string): number {
  return Number(left > right) - Number(left < right)
}

function parseDecimal(text: string): Decimal | undefined {
  const lower = text.toLowerCase()
  const marker = lower.indexOf('e')
  const mantissa = marker === -1 ? lower : lower.slice(0, marker)
  const exponent = marker === -1 ? '0' : lower.slice(marker + 1)
  return isDecimalText(mantissa, exponent) ? normalized(mantissa, Number(exponent)) : undefined
}

function isDecimalText(mantissa: string, exponent: string): boolean {
  const parts = mantissa.replace(SIGN, '').split('.')
  const hasDigits = parts.join('') !== ''
  const isWellFormed =
    parts.length <= MAX_MANTISSA_PARTS && parts.every((part) => DIGITS.test(part))
  return isWellFormed && hasDigits && EXPONENT.test(exponent)
}

// `mantissa` has digits, at most one point and an optional sign.
function normalized(mantissa: string, exponent: number): Decimal {
  const unsigned = mantissa.replace(SIGN, '')
  const point = unsigned.includes('.') ? unsigned.indexOf('.') : unsigned.length
  const allDigits = unsigned.replace('.', '')
  const significant = allDigits.replace(LEADING_ZEROS, '')
  const digits = withoutTrailingZeros(significant)
  if (digits === '') {
    return ZERO
  }
  const sign = mantissa.startsWith('-') ? -1 : 1
  return { sign, digits, exponent: exponent + point - (allDigits.length - significant.length) }
}

function withoutTrailingZeros(digits: string): string {
  const lastSignificant = Array.from(digits).findLastIndex((digit) => digit !== '0')
  return digits.slice(0, lastSignificant + 1)
}

function compareDecimals(left: Decimal, right: Decimal): number {
  if (left.sign !== right.sign) {
    return Math.sign(left.sign - right.sign)
  }
  return left.sign * compareMagnitudes(left, right)
}

function compareMagnitudes(left: Decimal, right: Decimal): number {
  if (left.exponent !== right.exponent) {
    return Math.sign(left.exponent - right.exponent)
  }
  return compareText(left.digits, right.digits)
}

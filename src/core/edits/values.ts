import { type ValueSpec, ValueType } from '../engine/table.ts'
import { type ClockSpec, isDate, isTime, isTimestamp, type YearSpan } from './temporal.ts'

// What a value typed in the grid becomes: the text bound to the statement (the server reads it in
// the type of its column), or why it cannot be written, for people. Nothing is rounded, cut or
// guessed: a value the column could not hold exactly is refused.
export type ValueReading =
  | { readonly isValid: true; readonly value: string }
  | { readonly isValid: false; readonly problem: string }

type SpecOf<T extends ValueType> = Extract<ValueSpec, { readonly type: T }>
type Reader<S extends ValueSpec> = (input: string, spec: S) => ValueReading
type Readers = { readonly [T in ValueType]: Reader<SpecOf<T>> }

// A whole number written the way the servers write it: no sign but a minus, no leading zero.
const WHOLE = /^-?(?:0|[1-9]\d*)$/
const DIGITS = /^\d+$/
const DECIMAL_POINT = '.'
const MINUS = '-'
const ZERO = '0'
const EXPONENT_MARK = 'e'
const BOOLEANS: ReadonlySet<string> = new Set(['true', 'false'])
const YEAR = /^\d{4}$/
const FIRST_YEAR = 1901
const LAST_YEAR = 2155
const ZERO_YEAR = '0000'
const UUID = /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i
const SET_SEPARATOR = ','
// Lists of values are cut in messages past this many.
const MAX_LISTED_OPTIONS = 10

const READERS: Readers = {
  [ValueType.Integer]: readInteger,
  [ValueType.Decimal]: readDecimal,
  [ValueType.Float]: checkedBy(isFloat, () => 'Type a number, such as -1.5 or 2e-3.'),
  [ValueType.Boolean]: readBoolean,
  [ValueType.Text]: readText,
  [ValueType.Date]: checkedBy(isDate, (spec) => `Type a date as YYYY-MM-DD${yearsText(spec)}.`),
  [ValueType.Time]: checkedBy(isTime, (spec) => `Type a time as HH:MM:SS${clockText(spec)}.`),
  [ValueType.Timestamp]: checkedBy(
    isTimestamp,
    (spec) => `Type a date and time as YYYY-MM-DD HH:MM:SS${clockText(spec)}${yearsText(spec)}.`,
  ),
  [ValueType.Year]: checkedBy(
    isYear,
    () => `Type a year from ${String(FIRST_YEAR)} to ${String(LAST_YEAR)}, or 0000.`,
  ),
  [ValueType.Json]: checkedBy(isJson, () => 'Type valid JSON.'),
  [ValueType.Choice]: readChoice,
  [ValueType.Uuid]: checkedBy(
    (input) => UUID.test(input),
    () => 'Type a UUID, such as 123e4567-e89b-12d3-a456-426614174000.',
  ),
  [ValueType.Server]: (input) => valid(input),
  [ValueType.ReadOnly]: (...[, spec]) => invalid(spec.reason),
}

export function readValue(input: string, spec: ValueSpec): ValueReading {
  // Each reader takes the spec of the type it is listed under.
  const read = READERS[spec.type] as Reader<ValueSpec>
  return read(input, spec)
}

export function isEditable(spec: ValueSpec): boolean {
  return spec.type !== ValueType.ReadOnly
}

function valid(value: string): ValueReading {
  return { isValid: true, value }
}

function invalid(problem: string): ValueReading {
  return { isValid: false, problem }
}

// A reader that takes the value as it was typed when `test` accepts it.
function checkedBy<S>(
  test: (input: string, spec: S) => boolean,
  problem: (spec: S) => string,
): (input: string, spec: S) => ValueReading {
  return (input, spec) => (test(input, spec) ? valid(input) : invalid(problem(spec)))
}

function readInteger(input: string, spec: SpecOf<typeof ValueType.Integer>): ValueReading {
  const isInRange =
    WHOLE.test(input) && BigInt(input) >= BigInt(spec.min) && BigInt(input) <= BigInt(spec.max)
  return isInRange ? valid(input) : invalid(`Type a whole number from ${spec.min} to ${spec.max}.`)
}

// Digits before and after the point, as many as the column keeps.
function readDecimal(input: string, spec: SpecOf<typeof ValueType.Decimal>): ValueReading {
  return isDecimal(input, spec) ? valid(input) : invalid(decimalProblem(spec))
}

function isDecimal(input: string, spec: SpecOf<typeof ValueType.Decimal>): boolean {
  const point = input.indexOf(DECIMAL_POINT)
  return point === -1
    ? WHOLE.test(input) && fitsIn(input, '', spec)
    : isDigitsAround(input, point) && fitsIn(input.slice(0, point), input.slice(point + 1), spec)
}

function isDigitsAround(text: string, point: number): boolean {
  return WHOLE.test(text.slice(0, point)) && DIGITS.test(text.slice(point + 1))
}

// Digits of the whole part (a lone 0 has none) and of the fraction; a precision of 0 has no limit.
function fitsIn(whole: string, fraction: string, spec: SpecOf<typeof ValueType.Decimal>): boolean {
  const unsigned = whole.replace(MINUS, '')
  const wholeDigits = unsigned === ZERO ? 0 : unsigned.length
  const hasRoom = wholeDigits <= spec.precision - spec.scale && fraction.length <= spec.scale
  return spec.precision === 0 || hasRoom
}

function decimalProblem({ precision, scale }: SpecOf<typeof ValueType.Decimal>): string {
  if (precision === 0) {
    return 'Type a number, such as -12.5.'
  }
  const before = String(precision - scale)
  return scale === 0
    ? `Type a whole number of at most ${before} digits.`
    : `Type a number with at most ${before} digits before the point and ${String(scale)} after it.`
}

// -1.5, 2e-3: digits, maybe a point and an exponent, and nothing the server would read as infinity.
// The digits before the exponent are checked here: JavaScript would also read .5, 0x10 or 1. as numbers.
function isFloat(input: string): boolean {
  const mark = input.toLowerCase().indexOf(EXPONENT_MARK)
  const mantissa = mark === -1 ? input : input.slice(0, mark)
  return isPlainDecimal(mantissa) && Number.isFinite(Number(input))
}

function isPlainDecimal(text: string): boolean {
  const point = text.indexOf(DECIMAL_POINT)
  return point === -1 ? WHOLE.test(text) : isDigitsAround(text, point)
}

function readBoolean(input: string): ValueReading {
  const value = input.toLowerCase()
  return BOOLEANS.has(value) ? valid(value) : invalid('Type true or false.')
}

// Characters, as the servers count them: code points.
function readText(input: string, { maxLength }: SpecOf<typeof ValueType.Text>): ValueReading {
  const length = Array.from(input).length
  return maxLength === 0 || length <= maxLength
    ? valid(input)
    : invalid(`At most ${String(maxLength)} characters: this has ${String(length)}.`)
}

function isYear(input: string): boolean {
  const year = Number(input)
  return YEAR.test(input) && (input === ZERO_YEAR || (year >= FIRST_YEAR && year <= LAST_YEAR))
}

function readChoice(input: string, spec: SpecOf<typeof ValueType.Choice>): ValueReading {
  const listed = optionsText(spec.options)
  if (!spec.isMultiple) {
    return spec.options.includes(input) ? valid(input) : invalid(`Type one of: ${listed}.`)
  }
  return isSubset(input, spec.options)
    ? valid(input)
    : invalid(`Type some of these, separated by commas: ${listed}.`)
}

function isSubset(input: string, options: readonly string[]): boolean {
  const chosen = input === '' ? [] : input.split(SET_SEPARATOR)
  return (
    chosen.every((option) => options.includes(option)) && new Set(chosen).size === chosen.length
  )
}

function optionsText(options: readonly string[]): string {
  const shown = options.slice(0, MAX_LISTED_OPTIONS).map((option) => JSON.stringify(option))
  return options.length > MAX_LISTED_OPTIONS ? `${shown.join(', ')}…` : shown.join(', ')
}

function isJson(input: string): boolean {
  try {
    JSON.parse(input)
    return true
  } catch (error) {
    if (error instanceof SyntaxError) {
      return false
    }
    throw error
  }
}

function yearsText({ minYear, maxYear }: YearSpan): string {
  return `, from year ${String(minYear)} to ${String(maxYear)}`
}

function clockText(spec: Pick<ClockSpec, 'fraction' | 'hasTimeZone'>): string {
  const fraction =
    spec.fraction === 0 ? '' : `, with at most ${String(spec.fraction)} digits after the second`
  return spec.hasTimeZone ? `${fraction} and its UTC offset, such as +02:00` : fraction
}

// Dates and times as the grid takes them: the forms the servers write them in, checked against the
// calendar, the clock and the column, so that the server never has to round or adjust one.

export interface ClockSpec {
  // Digits after the second the column keeps.
  readonly fraction: number
  readonly maxHour: number
  readonly hasTimeZone: boolean
}

export interface YearSpan {
  readonly minYear: number
  readonly maxYear: number
}

// What split() gives back: never an empty list.
type Parts = [string, ...string[]]

interface Day {
  readonly year: number
  readonly month: number
  readonly day: number
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/
const HOUR = /^\d{2,3}$/
const TWO_DIGITS = /^\d{2}$/
const DIGITS = /^\d+$/
const OFFSET_SIGN = /[+-]/
const DATE_LENGTH = 10
const DATE_TIME_SEPARATOR = ' '
const FRACTION_POINT = '.'
const SEPARATOR = ':'
const MINUTES = 60
const MAX_OFFSET_HOUR = 15
// The clock of a timestamp stops at 23:59:59.
const MAX_DAY_HOUR = 23
// Minutes and seconds after the hours of a clock; an offset may stop after its hours or minutes.
const CLOCK_PARTS = 2

export function isDate(text: string, years: YearSpan): boolean {
  const match = DATE.exec(text)
  return match !== null && isDay(dayOf(match), years)
}

function dayOf([, year, month, day]: RegExpExecArray): Day {
  return { year: Number(year), month: Number(month), day: Number(day) }
}

function isDay(day: Day, { minYear, maxYear }: YearSpan): boolean {
  return day.year >= minYear && day.year <= maxYear && isCalendarDay(day)
}

// The day exists when the calendar keeps it in its month: a day past the end of the month (2026-02-30
// is March 2nd), a day 0 or a month past December all move the date to another month.
function isCalendarDay({ year, month, day }: Day): boolean {
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  return date.getUTCMonth() === month - 1
}

export function isTime(text: string, spec: ClockSpec): boolean {
  const { clock, offset } = splitOffset(text)
  const [time, ...fraction] = clock.split(FRACTION_POINT) as Parts
  return (
    isClock(time, spec.maxHour) &&
    isFraction(fraction, spec.fraction) &&
    isOffset(offset, spec.hasTimeZone)
  )
}

function splitOffset(text: string): { readonly clock: string; readonly offset: string } {
  const offsetAt = text.search(OFFSET_SIGN)
  return offsetAt === -1
    ? { clock: text, offset: '' }
    : { clock: text.slice(0, offsetAt), offset: text.slice(offsetAt) }
}

// HH:MM:SS; three digits of hours only for a clock that goes past 99 (MySQL's TIME).
function isClock(time: string, maxHour: number): boolean {
  const [hour, ...minutesAndSeconds] = time.split(SEPARATOR) as Parts
  return (
    isHour(hour, maxHour) &&
    minutesAndSeconds.length === CLOCK_PARTS &&
    minutesAndSeconds.every(isSixtieth)
  )
}

function isHour(hour: string, maxHour: number): boolean {
  return HOUR.test(hour) && hour.length <= String(maxHour).length && Number(hour) <= maxHour
}

function isSixtieth(part: string): boolean {
  return TWO_DIGITS.test(part) && Number(part) < MINUTES
}

// The digits after the point, if there is one: no more than the column keeps, and at least one.
function isFraction(parts: readonly string[], maxDigits: number): boolean {
  return (
    parts.every((digits) => DIGITS.test(digits) && digits.length <= maxDigits) &&
    parts.length < CLOCK_PARTS
  )
}

// A column with a time zone needs the UTC offset: +02, +05:30, -00:19:32 as PostgreSQL writes it.
function isOffset(offset: string, hasTimeZone: boolean): boolean {
  if (!hasTimeZone) {
    return offset === ''
  }
  const [hours, ...rest] = offset.slice(1).split(SEPARATOR) as Parts
  return isOffsetHours(hours) && rest.length <= CLOCK_PARTS && rest.every(isSixtieth)
}

function isOffsetHours(hours: string): boolean {
  return TWO_DIGITS.test(hours) && Number(hours) <= MAX_OFFSET_HOUR
}

export function isTimestamp(text: string, spec: Omit<ClockSpec, 'maxHour'> & YearSpan): boolean {
  return (
    text.charAt(DATE_LENGTH) === DATE_TIME_SEPARATOR &&
    isDate(text.slice(0, DATE_LENGTH), spec) &&
    isTime(text.slice(DATE_LENGTH + 1), { ...spec, maxHour: MAX_DAY_HOUR })
  )
}

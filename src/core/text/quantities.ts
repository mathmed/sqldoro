// Counts and sizes shown short and rounded half up: 27k rows, 1.2M, 960 KB, 32 MB. One decimal
// under 10, none from there. The values are counts and sizes: whole numbers of 0 or more.
const THOUSAND = 1000n
const KIBIBYTE = 1024n
const TENTHS_PER_UNIT = 10n
// 9.9, in tenths: the largest amount shown with a decimal.
const MAX_TENTHS_WITH_DECIMAL = 99n
const HALF = 2n

interface Step {
  readonly unit: string
  readonly divisor: bigint
}

interface Scale {
  readonly base: bigint
  readonly steps: readonly Step[]
  // Past the last step, amounts grow instead of moving to a unit nobody reads.
  readonly largest: Step
}

const COUNTS = scaleOf(THOUSAND, ['', 'k', 'M', 'B'], 'T')
const SIZES = scaleOf(KIBIBYTE, [' B', ' KB', ' MB', ' GB', ' TB'], ' PB')

export function compactCount(count: bigint): string {
  return scaled(count, COUNTS)
}

// 1024-based, written KB, MB and GB as people read them.
export function formatSize(bytes: bigint): string {
  return scaled(bytes, SIZES)
}

function scaleOf(base: bigint, units: readonly string[], largest: string): Scale {
  return {
    base,
    steps: units.map((unit, power) => ({ unit, divisor: base ** BigInt(power) })),
    largest: { unit: largest, divisor: base ** BigInt(units.length) },
  }
}

// The first unit in which the rounded amount stays under the base: 999,999 is 1M, not 1000k.
function scaled(value: bigint, scale: Scale): string {
  const step =
    scale.steps.find((candidate) => rounded(value, candidate.divisor) < scale.base) ?? scale.largest
  return `${amount(value, step.divisor)}${step.unit}`
}

function rounded(value: bigint, divisor: bigint): bigint {
  return (value + divisor / HALF) / divisor
}

function amount(value: bigint, divisor: bigint): string {
  const tenths = rounded(value * TENTHS_PER_UNIT, divisor)
  if (tenths > MAX_TENTHS_WITH_DECIMAL) {
    return String(rounded(value, divisor))
  }
  const whole = tenths / TENTHS_PER_UNIT
  if (whole * TENTHS_PER_UNIT === tenths) {
    return String(whole)
  }
  return `${String(whole)}.${String(tenths % TENTHS_PER_UNIT)}`
}

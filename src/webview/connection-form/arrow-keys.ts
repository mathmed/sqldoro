const STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowLeft', -1],
  ['ArrowUp', -1],
  ['ArrowRight', 1],
  ['ArrowDown', 1],
])

// The item an arrow key moves to along a row of tabs or radio buttons, round the ends, from the one
// at `index` (none chosen counts as the first); undefined for any other key.
export function steppedItem<T>(items: readonly T[], key: string, index: number): T | undefined {
  const step = STEPS.get(key)
  return step === undefined
    ? undefined
    : items[(Math.max(index, 0) + step + items.length) % items.length]
}

import { describe, expect, it } from 'vitest'

import { mutateRange, touchedDeclarations } from './declarations.ts'

const SOURCE = `import { join } from 'node:path'

const LIMIT = 5

export function first(value: number): number {
  return value + LIMIT
}

export class Counter {
  private count = 0

  increment(): number {
    this.count += 1
    return this.count
  }

  reset(): void {
    this.count = 0
  }
}

export default class {
  name = join('a', 'b')
}
`

describe('touchedDeclarations', () => {
  it('should select the top-level declaration that holds each line', () => {
    expect(touchedDeclarations(SOURCE, [3, 6], false)).toEqual([
      { start: 3, end: 3 },
      { start: 5, end: 7 },
    ])
  })

  it('should select only the members of a class that hold a line', () => {
    expect(touchedDeclarations(SOURCE, [13, 18, 23], false)).toEqual([
      { start: 12, end: 15 },
      { start: 17, end: 19 },
      { start: 23, end: 23 },
    ])
  })

  it('should select the whole class for a line of the class outside its members', () => {
    expect(touchedDeclarations(SOURCE, [9, 16, 24], false)).toEqual([
      { start: 9, end: 20 },
      { start: 22, end: 24 },
    ])
  })

  it('should select a declaration once, however many of its lines changed', () => {
    expect(touchedDeclarations(SOURCE, [5, 6, 7], false)).toEqual([{ start: 5, end: 7 }])
  })

  it('should select nothing for lines outside every declaration', () => {
    expect(touchedDeclarations(SOURCE, [2, 4, 99], false)).toEqual([])
  })

  it('should select the import a line belongs to, which holds nothing to mutate', () => {
    expect(touchedDeclarations(SOURCE, [1], false)).toEqual([{ start: 1, end: 1 }])
  })

  it('should read JSX when asked to', () => {
    const view = 'export const View = (): unknown => (\n  <div>{1 + 1}</div>\n)\n'

    expect(touchedDeclarations(view, [2], true)).toEqual([{ start: 1, end: 3 }])
  })
})

describe('mutateRange', () => {
  it('should write the range of lines as Stryker reads it in `mutate`', () => {
    expect(mutateRange('src/core/a.ts', { start: 5, end: 7 })).toBe('src/core/a.ts:5-7')
  })
})

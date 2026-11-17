import { describe, expect, it } from 'vitest'

import { contractChanges } from './diff.ts'
import type { Contract, Setting } from './manifest.ts'

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    commands: new Set(['sqldoro.connect']),
    views: new Set(['sqldoro.connections']),
    viewContainers: new Set(['sqldoro']),
    settings: new Map<string, Setting>([
      ['sqldoro.mode', { type: 'string', values: ['"auto"', '"manual"'] }],
      ['sqldoro.rows', { type: 'integer', values: [] }],
    ]),
    ...overrides,
  }
}

describe('contractChanges', () => {
  it('should find nothing when the contract is the same', () => {
    expect(contractChanges(contract(), contract())).toEqual([])
  })

  it('should call a removed or renamed id breaking, and a new one an addition', () => {
    const head = contract({
      commands: new Set(['sqldoro.open']),
      views: new Set(),
      viewContainers: new Set(['sqldoro', 'sqldoro.panel']),
    })

    expect(contractChanges(contract(), head)).toEqual([
      { severity: 'breaking', item: 'command `sqldoro.connect`', detail: 'removed' },
      { severity: 'added', item: 'command `sqldoro.open`', detail: 'added' },
      { severity: 'breaking', item: 'view `sqldoro.connections`', detail: 'removed' },
      { severity: 'added', item: 'view container `sqldoro.panel`', detail: 'added' },
    ])
  })

  it('should call a removed setting breaking and a new one an addition', () => {
    const head = contract({
      settings: new Map([
        ['sqldoro.mode', { type: 'string', values: ['"auto"', '"manual"'] }],
        ['sqldoro.limit', { type: 'integer', values: [] }],
      ]),
    })

    expect(contractChanges(contract(), head)).toEqual([
      { severity: 'breaking', item: 'setting `sqldoro.rows`', detail: 'removed' },
      { severity: 'added', item: 'setting `sqldoro.limit`', detail: 'added' },
    ])
  })

  it('should call a setting breaking when its type changes or it allows fewer values', () => {
    const head = contract({
      settings: new Map([
        ['sqldoro.mode', { type: 'string', values: ['"auto"'] }],
        ['sqldoro.rows', { type: 'string', values: [] }],
      ]),
    })

    expect(contractChanges(contract(), head)).toEqual([
      { severity: 'breaking', item: 'setting `sqldoro.mode`', detail: 'no longer allows "manual"' },
      { severity: 'breaking', item: 'setting `sqldoro.rows`', detail: 'type integer → string' },
    ])
  })

  it('should call a setting breaking when it starts to allow only some values', () => {
    const head = contract({
      settings: new Map([
        ['sqldoro.mode', { type: 'string', values: ['"auto"', '"manual"'] }],
        ['sqldoro.rows', { type: 'integer', values: ['10', '100'] }],
      ]),
    })

    expect(contractChanges(contract(), head)).toEqual([
      { severity: 'breaking', item: 'setting `sqldoro.rows`', detail: 'now only allows 10, 100' },
    ])
  })

  it('should accept a setting that allows more values, or any value', () => {
    const head = contract({
      settings: new Map([
        ['sqldoro.mode', { type: 'string', values: [] }],
        ['sqldoro.rows', { type: 'integer', values: [] }],
      ]),
    })
    const more = contract({
      settings: new Map([
        ['sqldoro.mode', { type: 'string', values: ['"auto"', '"manual"', '"ask"'] }],
        ['sqldoro.rows', { type: 'integer', values: [] }],
      ]),
    })

    expect(contractChanges(contract(), head)).toEqual([])
    expect(contractChanges(contract(), more)).toEqual([])
  })
})

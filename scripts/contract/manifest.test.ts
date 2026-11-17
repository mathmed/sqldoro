import { describe, expect, it } from 'vitest'

import { readContract } from './manifest.ts'

const MANIFEST = JSON.stringify({
  name: 'sqldoro',
  contributes: {
    commands: [{ command: 'sqldoro.connect', title: 'Connect' }, { command: 'sqldoro.refresh' }],
    viewsContainers: { activitybar: [{ id: 'sqldoro', title: 'sqldoro' }] },
    views: {
      sqldoro: [{ id: 'sqldoro.connections' }, { id: 'sqldoro.history' }],
      explorer: [{ id: 'sqldoro.saved' }],
    },
    configuration: {
      title: 'sqldoro',
      properties: {
        'sqldoro.results.maxRows': { type: 'integer', default: 100_000 },
        'sqldoro.mode': { type: 'string', enum: ['auto', 'manual'] },
        'sqldoro.environments': { type: 'array', items: { type: 'string', enum: ['dev', 'prod'] } },
        'sqldoro.anything': { default: 1 },
        'sqldoro.either': { type: ['string', 'null'] },
      },
    },
  },
})

describe('readContract', () => {
  it('should read the ids of the commands, views and view containers', () => {
    const sut = readContract(MANIFEST)

    expect(sut.commands).toStrictEqual(new Set(['sqldoro.connect', 'sqldoro.refresh']))
    expect(sut.views).toStrictEqual(
      new Set(['sqldoro.connections', 'sqldoro.history', 'sqldoro.saved']),
    )
    expect(sut.viewContainers).toStrictEqual(new Set(['sqldoro']))
  })

  it('should read each setting with its type and the values it allows', () => {
    expect(readContract(MANIFEST).settings).toStrictEqual(
      new Map([
        ['sqldoro.results.maxRows', { type: 'integer', values: [] }],
        ['sqldoro.mode', { type: 'string', values: ['"auto"', '"manual"'] }],
        ['sqldoro.environments', { type: 'array', values: ['"dev"', '"prod"'] }],
        ['sqldoro.anything', { type: 'null', values: [] }],
        ['sqldoro.either', { type: '["string","null"]', values: [] }],
      ]),
    )
  })

  it('should read the settings of every section of a configuration list', () => {
    const manifest = JSON.stringify({
      contributes: {
        configuration: [
          { properties: { 'a.one': { type: 'boolean' } } },
          { title: 'no properties' },
        ],
      },
    })

    expect([...readContract(manifest).settings.keys()]).toEqual(['a.one'])
  })

  it('should read an empty contract from a manifest that contributes nothing', () => {
    expect(readContract('{"name":"x"}')).toStrictEqual({
      commands: new Set(),
      views: new Set(),
      viewContainers: new Set(),
      settings: new Map(),
    })
  })

  it('should refuse a contribution without its id', () => {
    expect(() => readContract('{"contributes":{"commands":[{"title":"x"}]}}')).toThrow(
      'expected "command" to be a string',
    )
  })
})

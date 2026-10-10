import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { EngineRegistry } from './engine-registry.ts'

const MYSQL = fakeEngine({ id: 'mysql', urlSchemes: ['mysql'] })
const POSTGRES = fakeEngine({ id: 'postgres', urlSchemes: ['postgres', 'PostgreSQL'] })

describe('EngineRegistry', () => {
  it('should list the engines in registration order', () => {
    const sut = new EngineRegistry([MYSQL, POSTGRES])

    expect(sut.engines).toStrictEqual([MYSQL, POSTGRES])
  })

  it('should list every URL scheme in lower case', () => {
    expect(new EngineRegistry([MYSQL, POSTGRES]).urlSchemes).toStrictEqual([
      'mysql',
      'postgres',
      'postgresql',
    ])
  })

  it('should find an engine by id', () => {
    const sut = new EngineRegistry([MYSQL, POSTGRES])

    expect(sut.find('postgres')).toBe(POSTGRES)
    expect(sut.get('mysql')).toBe(MYSQL)
  })

  it('should not find an unknown engine', () => {
    expect(new EngineRegistry([MYSQL]).find('oracle')).toBeUndefined()
  })

  it('should explain that an engine is unknown when one is required', () => {
    expect(() => new EngineRegistry([MYSQL]).get('oracle')).toThrow(
      new Error('Unknown database engine "oracle"'),
    )
  })

  it('should find an engine by URL scheme whatever its case', () => {
    const sut = new EngineRegistry([MYSQL, POSTGRES])

    expect(sut.findByScheme('POSTGRESQL')).toBe(POSTGRES)
    expect(sut.findByScheme('mysql')).toBe(MYSQL)
    expect(sut.findByScheme('mariadb')).toBeUndefined()
  })

  it('should refuse two engines with the same id', () => {
    expect(() => new EngineRegistry([MYSQL, fakeEngine({ id: 'mysql', urlSchemes: [] })])).toThrow(
      new Error('Duplicate engine id "mysql"'),
    )
  })

  it('should refuse two engines with the same URL scheme', () => {
    const other = fakeEngine({ id: 'other', urlSchemes: ['MYSQL'] })

    expect(() => new EngineRegistry([MYSQL, other])).toThrow(
      new Error('Duplicate URL scheme "mysql"'),
    )
  })
})

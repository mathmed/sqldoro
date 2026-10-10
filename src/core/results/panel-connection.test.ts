import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { EnvironmentTag, newConnection } from '../connection/connection.ts'
import { connectionText, panelConnection, panelTitle } from './panel-connection.ts'

const POLICY = { productionEnvironments: new Set(['prod', 'staging']) }
const SHOP = { ...newConnection('shop', fakeEngine()), name: 'Shop' }

describe('panelConnection', () => {
  it('should show the name, the environment and whether the connection writes', () => {
    expect(
      panelConnection({ ...SHOP, environment: EnvironmentTag.Staging, isReadOnly: false }, POLICY),
    ).toStrictEqual({ name: 'Shop', environment: 'staging', isProduction: true, isReadOnly: false })
    expect(panelConnection(SHOP, POLICY)).toStrictEqual({
      name: 'Shop',
      environment: '',
      isProduction: false,
      isReadOnly: true,
    })
  })
})

describe('connectionText and panelTitle', () => {
  const PROD = { name: 'Shop', environment: 'prod', isProduction: true, isReadOnly: true }
  const UNTAGGED = { ...PROD, environment: '', isProduction: false, isReadOnly: false }

  it('should put the environment first', () => {
    expect(connectionText(PROD)).toBe('PROD · Shop · read-only')
    expect(connectionText(UNTAGGED)).toBe('Shop · writes allowed')
  })

  it('should spell the environment out in the title of the panel', () => {
    expect(panelTitle('Results: q.sql', PROD)).toBe('Results: q.sql · PROD')
    expect(panelTitle('Results: q.sql', UNTAGGED)).toBe('Results: q.sql')
  })
})

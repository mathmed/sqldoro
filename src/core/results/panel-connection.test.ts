import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { ConnectionColor, EnvironmentTag, newConnection } from '../connection/connection.ts'
import { connectionText, panelConnection, panelTitle } from './panel-connection.ts'

const POLICY = { productionEnvironments: new Set(['prod', 'staging']) }
const SHOP = { ...newConnection('shop', fakeEngine()), name: 'Shop' }

describe('panelConnection', () => {
  it('should show the name, the environment and whether the connection writes', () => {
    expect(
      panelConnection({ ...SHOP, environment: EnvironmentTag.Staging, isReadOnly: false }, POLICY),
    ).toStrictEqual({
      name: 'Shop',
      environment: 'staging',
      isProduction: true,
      isReadOnly: false,
      color: 'charts.red',
    })
    expect(panelConnection(SHOP, POLICY)).toStrictEqual({
      name: 'Shop',
      environment: '',
      isProduction: false,
      isReadOnly: true,
      color: '',
    })
  })

  it('should tint the panel with the color of the connection, else of its environment', () => {
    const local = { ...SHOP, environment: EnvironmentTag.Local }

    expect(panelConnection({ ...local, color: ConnectionColor.Purple }, POLICY).color).toBe(
      'charts.purple',
    )
    expect(panelConnection(local, POLICY).color).toBe('charts.green')
    expect(
      panelConnection(
        { ...SHOP, environment: EnvironmentTag.Production, color: ConnectionColor.Green },
        POLICY,
      ).color,
    ).toBe('charts.red')
  })
})

describe('connectionText and panelTitle', () => {
  const PROD = {
    name: 'Shop',
    environment: 'prod',
    isProduction: true,
    isReadOnly: true,
    color: 'charts.red',
  }
  const UNTAGGED = { ...PROD, environment: '', isProduction: false, isReadOnly: false }

  it('should put the environment first', () => {
    expect(connectionText(PROD)).toBe('PROD · Shop')
    expect(connectionText(UNTAGGED)).toBe('Shop')
  })

  it('should spell the environment out in the title of the panel', () => {
    expect(panelTitle('Results: q.sql', PROD)).toBe('Results: q.sql · PROD')
    expect(panelTitle('Results: q.sql', UNTAGGED)).toBe('Results: q.sql')
  })
})

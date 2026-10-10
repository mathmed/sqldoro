import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { window } from '../../../test/vscode.ts'
import { newConnection } from '../../core/connection/connection.ts'
import { showConnectionLost } from './connection-lost.ts'

describe('showConnectionLost', () => {
  it('should warn about the connection that was lost', () => {
    showConnectionLost(
      { ...newConnection('a', fakeEngine()), name: 'Shop' },
      'Connection lost: timeout',
    )

    expect(window.showWarningMessage).toHaveBeenCalledWith('Shop: Connection lost: timeout')
  })
})

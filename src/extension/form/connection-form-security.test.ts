import { describe, expect, it } from 'vitest'

import { formContext as context, descriptionOf, draft, VALID } from '../../../test/support/form.ts'
import {
  answerFiles,
  answerInputs,
  answerQuickPicks,
  labelOf,
  lastQuickPickItems,
} from '../../../test/support/prompts.ts'
import {
  DEFAULT_SSH_TUNNEL,
  EnvironmentTag,
  SshAuthMethod,
  SslMode,
} from '../../core/connection/connection.ts'
import { SecretKind } from '../../core/connection/secrets.ts'
import { runConnectionForm } from './connection-form.ts'

describe('runConnectionForm security and safety fields', () => {
  describe('SSL', () => {
    it('should show the certificate files once SSL is on and always reject with the verify modes', async () => {
      answerQuickPicks('SSL', 'Verify full', 'CA certificate', 'Save')
      answerFiles('/certs/ca.pem')

      const result = await runConnectionForm(
        draft({ ...VALID, ssl: { ...VALID.ssl, shouldRejectUnauthorized: false } }),
        context(),
      )

      expect(result?.connection.ssl).toStrictEqual({
        mode: SslMode.VerifyFull,
        caPath: '/certs/ca.pem',
        certPath: '',
        keyPath: '',
        shouldRejectUnauthorized: true,
      })
      expect(lastQuickPickItems().map(labelOf)).toContain('Client key')
      expect(lastQuickPickItems().map(labelOf)).not.toContain('Unauthorized certificates')
    })

    it('should let require accept unauthorized certificates', async () => {
      answerQuickPicks(
        'SSL',
        'Required',
        'Unauthorized certificates',
        'Accept them: encrypt without checking the server',
        'Save',
      )

      await expect(runConnectionForm(draft(), context())).resolves.toMatchObject({
        connection: { ssl: { mode: SslMode.Require, shouldRejectUnauthorized: false } },
      })
    })

    it('should replace and remove certificate files', async () => {
      const ssl = {
        mode: SslMode.Require,
        caPath: '/ca',
        certPath: '/cert',
        keyPath: '/key',
        shouldRejectUnauthorized: true,
      }
      answerQuickPicks(
        'CA certificate',
        'Choose a file…',
        'Client certificate',
        'Remove the file',
        'Client key',
        'Remove the file',
        'Save',
      )
      answerFiles('/new-ca')

      const result = await runConnectionForm(draft({ ...VALID, ssl }), context())

      expect(result?.connection.ssl).toMatchObject({
        caPath: '/new-ca',
        certPath: '',
        keyPath: '',
      })
      expect(descriptionOf('Client key')).toBe('(none)')
    })

    it('should keep a file when the dialog or the choice is dismissed', async () => {
      const ssl = {
        mode: SslMode.Require,
        caPath: '/ca',
        certPath: '',
        keyPath: '',
        shouldRejectUnauthorized: true,
      }
      answerQuickPicks('CA certificate', undefined, 'Client certificate', 'Save')
      answerFiles(undefined)

      await expect(runConnectionForm(draft({ ...VALID, ssl }), context())).resolves.toMatchObject({
        connection: { ssl },
      })
    })

    it('should forget the certificate files when SSL is turned off', async () => {
      const ssl = {
        mode: SslMode.Require,
        caPath: '/ca',
        certPath: '',
        keyPath: '',
        shouldRejectUnauthorized: false,
      }
      answerQuickPicks('SSL', 'Disabled', 'Save')

      await expect(runConnectionForm(draft({ ...VALID, ssl }), context())).resolves.toMatchObject({
        connection: { ssl: { mode: SslMode.Disable, caPath: '', shouldRejectUnauthorized: true } },
      })
    })
  })

  describe('SSH tunnel', () => {
    it('should set up a tunnel with a password', async () => {
      answerQuickPicks(
        'Tunnel',
        'Through SSH, with a password',
        'SSH host',
        'SSH port',
        'SSH user',
        'SSH password',
        'Save',
      )
      answerInputs('bastion', '2222', 'ops', 'ssh-secret')

      const result = await runConnectionForm(draft(), context())

      expect(result?.connection.ssh).toStrictEqual({
        host: 'bastion',
        port: 2222,
        user: 'ops',
        authMethod: SshAuthMethod.Password,
        privateKeyPath: '',
      })
      expect(result?.secretChanges).toStrictEqual(new Map([[SecretKind.SshPassword, 'ssh-secret']]))
      expect(descriptionOf('Tunnel')).toBe('Through SSH, with a password')
    })

    it('should set up a tunnel with a private key and its passphrase', async () => {
      const ssh = { ...DEFAULT_SSH_TUNNEL, host: 'bastion', user: 'ops' }
      answerQuickPicks(
        'Tunnel',
        'Through SSH, with a private key',
        'Private key',
        'Passphrase',
        'Save',
      )
      answerFiles('/home/me/.ssh/id_ed25519')
      answerInputs('phrase')

      const result = await runConnectionForm(draft({ ...VALID, ssh }), context())

      expect(result?.connection.ssh).toStrictEqual({
        ...ssh,
        authMethod: SshAuthMethod.PrivateKey,
        privateKeyPath: '/home/me/.ssh/id_ed25519',
      })
      expect(result?.secretChanges).toStrictEqual(new Map([[SecretKind.SshPassphrase, 'phrase']]))
      expect(lastQuickPickItems().map(labelOf)).not.toContain('SSH password')
    })

    it('should remove the tunnel', async () => {
      answerQuickPicks('Tunnel', 'No tunnel', 'Save')

      await expect(
        runConnectionForm(draft({ ...VALID, ssh: DEFAULT_SSH_TUNNEL }), context()),
      ).resolves.toMatchObject({
        connection: { ssh: undefined },
      })
    })

    it('should start a tunnel field from the defaults when there is no tunnel yet', async () => {
      answerQuickPicks(undefined)

      await runConnectionForm(
        draft({ ...VALID, ssh: { ...DEFAULT_SSH_TUNNEL, host: 'bastion', user: 'ops' } }),
        context(),
      )

      expect(descriptionOf('SSH port')).toBe('22')
    })
  })

  it('should tag the environment and allow writes', async () => {
    answerQuickPicks('Environment', 'Production', 'Writes', 'Allow writes', 'Save')

    await expect(runConnectionForm(draft(), context())).resolves.toMatchObject({
      connection: { environment: EnvironmentTag.Production, isReadOnly: false },
    })
  })
})

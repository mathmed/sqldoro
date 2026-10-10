// Shared setup of the connection form tests: two engines, a valid connection and a form context.
import { vi } from 'vitest'

import { type ConnectionConfig, newConnection } from '../../src/core/connection/connection.ts'
import type { SecretKind } from '../../src/core/connection/secrets.ts'
import { validateConnection } from '../../src/core/connection/validation.ts'
import { EngineRegistry } from '../../src/core/engine/engine-registry.ts'
import type { FormContext } from '../../src/extension/form/connection-form.ts'
import type { FormDraft } from '../../src/extension/form/form-draft.ts'
import { fakeEngine } from '../fakes/engine.ts'
import { labelOf, lastQuickPickItems } from './prompts.ts'

const MYSQL = fakeEngine({
  id: 'mysql',
  displayName: 'MySQL',
  defaultPort: 3306,
  urlSchemes: ['mysql'],
})
const POSTGRES = fakeEngine({
  id: 'postgres',
  displayName: 'PostgreSQL',
  defaultPort: 5432,
  urlSchemes: ['postgres'],
})

const ENGINES = new EngineRegistry([MYSQL, POSTGRES])
export const VALID: ConnectionConfig = {
  ...newConnection('id', POSTGRES),
  name: 'Shop',
  user: 'app',
}

export function draft(
  connection: ConnectionConfig = VALID,
  storedSecrets: SecretKind[] = [],
): FormDraft {
  return { connection, secretChanges: new Map(), storedSecrets: new Set(storedSecrets) }
}

export function formContext(
  test = vi.fn(async (): Promise<void> => Promise.resolve()),
): FormContext & { readonly test: typeof test } {
  return {
    title: 'Edit Connection',
    engines: ENGINES,
    validate: (connection) =>
      validateConnection(connection, { engines: ENGINES, takenNameKeys: new Set() }),
    test,
  }
}

// The value the form shows next to a field the last time it was displayed.
export function descriptionOf(label: string): string | undefined {
  return lastQuickPickItems().find((item) => labelOf(item) === label)?.description
}

import { type FormState, openForm } from '../../src/core/connection-form/form-state.ts'
import { FormMode, type FormSetup, FormStart } from '../../src/core/connection-form/protocol.ts'
// What the connection form opens with, for the tests of the core, the webview and the extension host:
// two engines (MySQL first, so it is the default) and a new connection.
import {
  ConnectionColor,
  type ConnectionConfig,
  DEFAULT_SSL,
  EnvironmentTag,
} from '../../src/core/connection/connection.ts'
import { SecretKind } from '../../src/core/connection/secrets.ts'
import type { EngineOption } from '../../src/core/engine/engine.ts'

const MYSQL_OPTION: EngineOption = { id: 'mysql', displayName: 'MySQL', defaultPort: 3306 }
const POSTGRES_OPTION: EngineOption = {
  id: 'postgres',
  displayName: 'PostgreSQL',
  defaultPort: 5432,
}

export const NEW_CONNECTION: ConnectionConfig = {
  id: 'id-1',
  name: '',
  engine: 'mysql',
  host: 'localhost',
  port: 3306,
  user: '',
  database: '',
  ssl: DEFAULT_SSL,
  ssh: undefined,
  environment: EnvironmentTag.None,
  isReadOnly: true,
  color: ConnectionColor.None,
  folder: '',
}

// A connection the form can save as it is.
export const VALID_CONNECTION: ConnectionConfig = { ...NEW_CONNECTION, name: 'Shop', user: 'app' }

export function formSetup(changes: Partial<FormSetup> = {}): FormSetup {
  return {
    mode: FormMode.New,
    start: FormStart.Details,
    connection: NEW_CONNECTION,
    heldSecrets: [],
    engines: [MYSQL_OPTION, POSTGRES_OPTION],
    takenNameKeys: ['billing'],
    productionEnvironments: ['prod', 'staging'],
    ...changes,
  }
}

// A form just opened on a new connection, with the given state.
export function openedForm(changes: Partial<FormState> = {}): FormState {
  return { ...openForm(formSetup()), ...changes }
}

// A form on a connection it can save, whose password is stored.
export function validForm(): FormState {
  return openForm(formSetup({ connection: VALID_CONNECTION, heldSecrets: [SecretKind.Password] }))
}

import { describe, expect, it } from 'vitest'

import {
  formSetup,
  NEW_CONNECTION,
  openedForm as opened,
  VALID_CONNECTION,
} from '../../../test/fixtures/connection-form.ts'
import { DEFAULT_SSL, EnvironmentTag, SslMode } from '../connection/connection.ts'
import { SecretKind } from '../connection/secrets.ts'
import { ConnectionField } from '../connection/validation.ts'
import {
  applyImport,
  backToPicker,
  canChangeEngine,
  chooseEngine,
  closeImport,
  engineOf,
  openAdvanced,
  openImport,
  receiveImport,
  refuseImport,
  toggleAdvanced,
  typeImport,
} from './form-flow.ts'
import {
  CLOSED_IMPORT,
  FormControl,
  type FormState,
  FormStep,
  ListingState,
  NO_DATABASES,
  openForm,
  TestState,
  typeSecret,
} from './form-state.ts'
import { FormMode, FormStart } from './protocol.ts'

const POSTGRES = { id: 'postgres', displayName: 'PostgreSQL', defaultPort: 5432 }
const IMPORTED = {
  ...NEW_CONNECTION,
  name: 'db.example.com/shop',
  engine: 'postgres',
  host: 'db.example.com',
  port: 6432,
  user: 'app',
  database: 'shop',
  ssl: { ...DEFAULT_SSL, mode: SslMode.Require },
}

function edited(changes: Partial<FormState['draft']['connection']>): FormState {
  return openForm(
    formSetup({ mode: FormMode.Edit, connection: { ...VALID_CONNECTION, ...changes } }),
  )
}

describe('engineOf and canChangeEngine', () => {
  it('should find the registered engine of the connection', () => {
    expect(engineOf(opened())).toStrictEqual({
      id: 'mysql',
      displayName: 'MySQL',
      defaultPort: 3306,
    })
    expect(engineOf(edited({ engine: 'oracle' }))).toBeUndefined()
  })

  it('should let a new connection change its engine, a saved one only when it is unknown', () => {
    expect(canChangeEngine(opened())).toBe(true)
    expect(canChangeEngine(edited({}))).toBe(false)
    expect(canChangeEngine(edited({ engine: 'oracle' }))).toBe(true)
  })
})

describe('the engine picker', () => {
  it('should bring the default port of the engine chosen and go to the fields', () => {
    const picker = openForm(formSetup({ start: FormStart.Picker }))

    const sut = chooseEngine(picker, POSTGRES)

    expect(sut).toMatchObject({
      step: FormStep.Details,
      draft: { connection: { engine: 'postgres', port: 5432 } },
      focus: { field: ConnectionField.Name },
    })
    expect(sut.touched).toStrictEqual(new Set([ConnectionField.Engine]))
  })

  it('should go back to the engines keeping what was typed, and keep a changed port', () => {
    const typed = chooseEngine(opened(), POSTGRES)
    const withPort = {
      ...typed,
      draft: { ...typed.draft, connection: { ...typed.draft.connection, host: 'db', port: 6543 } },
    }

    const back = backToPicker(withPort)
    const sut = chooseEngine(back, { id: 'mysql', displayName: 'MySQL', defaultPort: 3306 })

    expect(back).toMatchObject({ step: FormStep.Picker, focus: { field: ConnectionField.Engine } })
    expect(sut.draft.connection).toMatchObject({ engine: 'mysql', host: 'db', port: 6543 })
  })

  it('should keep a saved connection off the engines', () => {
    const saved = edited({})

    expect(backToPicker(saved)).toBe(saved)
  })
})

describe('importing a connection string', () => {
  it('should open the input on the fields and take the user there', () => {
    const picker = openForm(formSetup({ start: FormStart.Picker }))

    expect(openImport(typeImport(picker, 'mysql://'))).toMatchObject({
      step: FormStep.Details,
      importer: { ...CLOSED_IMPORT, isOpen: true, text: 'mysql://' },
      focus: { field: FormControl.ConnectionString },
    })
  })

  it('should forget what was typed when the input closes, not the warnings', () => {
    const typed = typeImport(openImport(opened()), 'postgres://app:pw@db')
    const warned = { ...typed, importer: { ...typed.importer, warnings: ['a'], problem: 'bad' } }

    expect(closeImport(warned).importer).toStrictEqual({ ...CLOSED_IMPORT, warnings: ['a'] })
  })

  it('should forget a problem once the user types again', () => {
    const refused = refuseImport(applyImport(typeImport(openImport(opened()), 'x')), 'Bad URL')

    expect(typeImport(refused, 'y').importer).toMatchObject({ text: 'y', problem: '' })
  })

  it('should send the connection string once at a time', () => {
    const typed = typeImport(openImport(opened()), 'postgres://db')

    const sut = applyImport({ ...typed, importer: { ...typed.importer, problem: 'old' } })

    expect(sut.importer).toMatchObject({ isApplying: true, problem: '' })
    expect(sut.submission).toStrictEqual({ type: 'import', text: 'postgres://db' })
    expect(applyImport(sut)).toBe(sut)
  })

  it('should fill the fields the connection string speaks for, and close the input', () => {
    const typed = typeImport(openImport(opened()), 'postgres://app:pw@db.example.com:6432/shop')
    const testedBefore = { ...typed, test: { state: TestState.Failed, message: 'down' } }

    const sut = receiveImport(applyImport(testedBefore), {
      connection: IMPORTED,
      urlSecrets: [],
      warnings: ['Ignored the URL parameter "x"'],
    })

    expect(sut).toMatchObject({
      step: FormStep.Details,
      isAdvancedOpen: true,
      importer: { ...CLOSED_IMPORT, warnings: ['Ignored the URL parameter "x"'] },
      test: { state: TestState.Idle },
      databases: NO_DATABASES,
      focus: { field: ConnectionField.Name },
    })
    expect(sut.draft.connection).toStrictEqual({ ...IMPORTED, id: NEW_CONNECTION.id })
  })

  it('should keep what the user set that a connection string does not say', () => {
    const named = {
      ...opened(),
      draft: {
        ...opened().draft,
        connection: { ...NEW_CONNECTION, name: 'Mine', environment: EnvironmentTag.Production },
      },
    }

    const sut = receiveImport(named, {
      connection: { ...IMPORTED, ssl: DEFAULT_SSL },
      urlSecrets: [],
      warnings: [],
    })

    expect(sut.draft.connection).toMatchObject({
      name: 'Mine',
      environment: EnvironmentTag.Production,
      host: 'db.example.com',
    })
    expect(sut.isAdvancedOpen).toBe(false)
  })

  it('should hold the password of the connection string over the one typed', () => {
    const stored = openForm(formSetup({ heldSecrets: [SecretKind.SshPassword] }))
    const typed = typeSecret(
      typeSecret(stored, SecretKind.Password, 'typed'),
      SecretKind.SshPassword,
      'ssh',
    )

    const sut = receiveImport(typed, {
      connection: IMPORTED,
      urlSecrets: [SecretKind.Password],
      warnings: [],
    })

    expect(sut.draft).toMatchObject({
      secretChanges: new Map([[SecretKind.SshPassword, 'ssh']]),
      heldSecrets: new Set([SecretKind.SshPassword, SecretKind.Password]),
      urlSecrets: new Set([SecretKind.Password]),
    })
  })

  it('should say why the connection string was refused, and take the user back to it', () => {
    const applying = applyImport(typeImport(openImport(opened()), 'mongodb://db'))
    const closed = closeImport(applying)

    const sut = refuseImport(closed, 'Unsupported URL scheme "mongodb"')

    expect(sut.importer).toMatchObject({
      isOpen: true,
      isApplying: false,
      problem: 'Unsupported URL scheme "mongodb"',
    })
    expect(sut.focus).toStrictEqual({ field: FormControl.ConnectionString })
  })
})

describe('the advanced settings', () => {
  it('should fold and unfold', () => {
    const open = toggleAdvanced(opened())

    expect(open.isAdvancedOpen).toBe(true)
    expect(toggleAdvanced(open).isAdvancedOpen).toBe(false)
  })

  it('should open on the SSL mode', () => {
    expect(openAdvanced(opened())).toMatchObject({
      isAdvancedOpen: true,
      focus: { field: ConnectionField.SslMode },
    })
    expect(openAdvanced(toggleAdvanced(opened())).isAdvancedOpen).toBe(true)
  })

  it('should leave a listing alone', () => {
    const listing = { ...opened(), databases: { ...NO_DATABASES, state: ListingState.Listing } }

    expect(toggleAdvanced(listing).databases).toBe(listing.databases)
  })
})

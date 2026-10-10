import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { SecretKind } from '../../core/connection/secrets.ts'
import type { ConnectionField } from '../../core/connection/validation.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import {
  type FormDraft,
  SecretState,
  secretState,
  withConnection,
  withSecret,
} from './form-draft.ts'
import { askChoice, askFile, askText, type Choice } from './prompts.ts'

export const FormSection = {
  Connection: 'Connection',
  Security: 'Security',
  Tunnel: 'SSH tunnel',
  Safety: 'Safety',
} as const

export type FormSection = (typeof FormSection)[keyof typeof FormSection]

export interface FormField {
  readonly label: string
  readonly section: FormSection
  readonly issueFields: readonly ConnectionField[]
  readonly isVisible: (connection: ConnectionConfig) => boolean
  readonly describe: (draft: FormDraft, engines: EngineRegistry) => string
  // Resolves with the changed draft, or undefined when the user gave up.
  readonly edit: (draft: FormDraft, engines: EngineRegistry) => Promise<FormDraft | undefined>
}

interface FieldBase {
  readonly label: string
  readonly section: FormSection
  readonly issueFields?: readonly ConnectionField[]
  readonly isVisible?: (connection: ConnectionConfig) => boolean
}

export interface TextFieldSpec extends FieldBase {
  readonly prompt: string
  readonly read: (connection: ConnectionConfig) => string
  readonly write: (connection: ConnectionConfig, value: string) => ConnectionConfig
  readonly validate: (value: string) => string | undefined
  readonly placeHolder?: string
  readonly emptyText?: string
}

export interface ChoiceFieldSpec<T> extends FieldBase {
  readonly choices: (engines: EngineRegistry) => readonly Choice<T>[]
  readonly read: (connection: ConnectionConfig) => T
  readonly write: (
    connection: ConnectionConfig,
    value: T,
    engines: EngineRegistry,
  ) => ConnectionConfig
}

export interface FileFieldSpec extends FieldBase {
  readonly read: (connection: ConnectionConfig) => string
  readonly write: (connection: ConnectionConfig, path: string) => ConnectionConfig
}

export interface SecretFieldSpec extends FieldBase {
  readonly kind: SecretKind
  readonly prompt: string
  readonly placeHolder: string
}

const ALWAYS = (): boolean => true
const NONE = '(none)'
const CHOOSE_FILE = 'choose'
const REMOVE = 'remove'
const ENTER = 'enter'

function orElse(text: string, fallback: string): string {
  return text === '' ? fallback : text
}

function base(spec: FieldBase): Pick<FormField, 'issueFields' | 'isVisible' | 'label' | 'section'> {
  return {
    label: spec.label,
    section: spec.section,
    issueFields: spec.issueFields ?? [],
    isVisible: spec.isVisible ?? ALWAYS,
  }
}

export function textField(spec: TextFieldSpec): FormField {
  return {
    ...base(spec),
    describe: (draft) => orElse(spec.read(draft.connection), spec.emptyText ?? ''),
    edit: async (draft) => {
      const value = await askText({
        title: spec.label,
        prompt: spec.prompt,
        value: spec.read(draft.connection),
        placeHolder: spec.placeHolder ?? '',
        validate: spec.validate,
      })
      return value === undefined
        ? undefined
        : withConnection(draft, spec.write(draft.connection, value))
    },
  }
}

export function choiceField<T>(spec: ChoiceFieldSpec<T>): FormField {
  return {
    ...base(spec),
    describe: (draft, engines) => {
      const current = spec.read(draft.connection)
      return (
        spec.choices(engines).find((choice) => choice.value === current)?.label ?? String(current)
      )
    },
    edit: async (draft, engines) => {
      const value = await askChoice(spec.label, spec.choices(engines))
      return value === undefined
        ? undefined
        : withConnection(draft, spec.write(draft.connection, value, engines))
    },
  }
}

export function fileField(spec: FileFieldSpec): FormField {
  return {
    ...base(spec),
    describe: (draft) => orElse(spec.read(draft.connection), NONE),
    edit: async (draft) => {
      const path = await chooseFileAction(spec.label, spec.read(draft.connection) !== '')
      return path === undefined
        ? undefined
        : withConnection(draft, spec.write(draft.connection, path))
    },
  }
}

// The new path, an empty path to remove the file, or undefined when the user gave up.
async function chooseFileAction(label: string, isSet: boolean): Promise<string | undefined> {
  const choices: Choice<string>[] = [
    { label: '$(folder-opened) Choose a file…', value: CHOOSE_FILE },
  ]
  const action = isSet
    ? await askChoice(label, [...choices, { label: '$(close) Remove the file', value: REMOVE }])
    : CHOOSE_FILE
  if (action === REMOVE) {
    return ''
  }
  return action === undefined ? undefined : askFile(label)
}

export function secretField(spec: SecretFieldSpec): FormField {
  return {
    ...base(spec),
    describe: (draft) => secretState(draft, spec.kind),
    edit: async (draft) => {
      const value = await askSecret(spec, secretState(draft, spec.kind))
      return value === undefined ? undefined : withSecret(draft, spec.kind, value)
    },
  }
}

// A stored or changed secret can be replaced or removed; an empty new value means no secret.
async function askSecret(spec: SecretFieldSpec, state: SecretState): Promise<string | undefined> {
  const hasValue = state === SecretState.Stored || state === SecretState.Changed
  const action = hasValue
    ? await askChoice(spec.label, [
        { label: `$(edit) Enter a new ${spec.label.toLowerCase()}`, value: ENTER },
        { label: `$(trash) Remove the ${spec.label.toLowerCase()}`, value: REMOVE },
      ])
    : ENTER
  if (action === REMOVE) {
    return ''
  }
  return action === undefined
    ? undefined
    : askText({
        title: spec.label,
        prompt: spec.prompt,
        value: '',
        placeHolder: spec.placeHolder,
        isPassword: true,
      })
}

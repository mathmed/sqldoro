import { EnvironmentTag } from '../../core/connection/connection.ts'
import { withEnvironment } from '../../core/safety/guard.ts'
import { ENVIRONMENT_LABELS } from '../labels.ts'
import { readSettings } from '../settings.ts'
import { choiceField, choicesOf, type FormField, FormSection } from './field-kinds.ts'

// Where the connection runs, and whether it may write.
export const SAFETY_FIELDS: readonly FormField[] = [
  choiceField({
    label: 'Environment',
    section: FormSection.Safety,
    choices: () => choicesOf(Object.values(EnvironmentTag), ENVIRONMENT_LABELS),
    read: (connection) => connection.environment,
    // A production tag makes the connection read-only: writes are allowed after, on purpose.
    write: (connection, environment) =>
      withEnvironment(connection, environment, readSettings().policy),
  }),
  choiceField({
    label: 'Writes',
    section: FormSection.Safety,
    choices: () => [
      { label: 'Read-only (recommended)', value: true },
      { label: 'Allow writes', value: false },
    ],
    read: (connection) => connection.isReadOnly,
    write: (connection, isReadOnly) => ({ ...connection, isReadOnly }),
  }),
]

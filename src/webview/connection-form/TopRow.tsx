import type { ReactElement } from 'react'

import { policyOf } from '../../core/connection-form/form-state.ts'
import { EnvironmentTag } from '../../core/connection/connection.ts'
import { ENVIRONMENT_LABELS, labelOf } from '../../core/connection/labels.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { withEnvironment } from '../../core/safety/guard.ts'
import { BoundText } from './bound-fields.tsx'
import { type Option, SelectInput, SwitchInput } from './controls.tsx'
import type { FormView } from './form-view.ts'

const ENVIRONMENTS: readonly Option<EnvironmentTag>[] = Object.values(EnvironmentTag).map(
  (tag) => ({ value: tag, label: labelOf(ENVIRONMENT_LABELS, tag) }),
)
const READ_ONLY_HELP = 'sqldoro refuses every statement that may write. Production tags turn it on.'

// The name and the safety of the connection: always in sight, above the tabs.
export const TopRow = ({ view }: { readonly view: FormView }): ReactElement => {
  const { connection } = view.state.draft
  const policy = policyOf(view.state.setup)
  return (
    <div className="top-row">
      <BoundText
        view={view}
        field={ConnectionField.Name}
        value={connection.name}
        isRequired
        write={(changed, name) => ({ ...changed, name })}
      />
      <SelectInput
        spec={{ id: 'environment', label: 'Environment' }}
        value={connection.environment}
        options={ENVIRONMENTS}
        onSelect={(environment) => {
          view.actions.edit(null, (changed) => withEnvironment(changed, environment, policy))
        }}
      />
      <SwitchInput
        spec={{ id: 'read-only', label: 'Read-only', help: READ_ONLY_HELP }}
        isOn={connection.isReadOnly}
        onToggle={(isReadOnly) => {
          view.actions.edit(null, (changed) => ({ ...changed, isReadOnly }))
        }}
      />
    </div>
  )
}

import type { ReactElement } from 'react'

import { FormAction } from '../../core/connection-form/form-state.ts'
import { submit } from '../../core/connection-form/form-submit.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { AdvancedSection } from './AdvancedSection.tsx'
import { BoundText } from './bound-fields.tsx'
import { CardHeader, SUBTITLE_ID, TITLE_ID } from './CardHeader.tsx'
import { EnvironmentFields } from './EnvironmentFields.tsx'
import type { FormView } from './form-view.ts'
import { FormFooter } from './FormFooter.tsx'
import { ImportPanel, ImportWarnings } from './ImportPanel.tsx'
import { ServerFields } from './ServerFields.tsx'
import { TunnelFields } from './TunnelFields.tsx'

// The connection in a card: the engine on top, then one field per row, the label on the left, down
// to the SSL settings, and the actions at the bottom. Enter in a field saves.
export const ConnectionCard = ({ view }: { readonly view: FormView }): ReactElement => (
  <form
    className="card"
    aria-labelledby={`${TITLE_ID} ${SUBTITLE_ID}`}
    noValidate
    onSubmit={(event) => {
      event.preventDefault()
      view.actions.update((state) => submit(state, FormAction.Save))
    }}
  >
    <CardHeader view={view} />
    {view.state.importer.isOpen ? <ImportPanel view={view} /> : null}
    <ImportWarnings warnings={view.state.importer.warnings} />
    <div className="card-body">
      <BoundText
        view={view}
        field={ConnectionField.Name}
        value={view.state.draft.connection.name}
        isRequired
        placeholder="Connection name"
        write={(connection, name) => ({ ...connection, name })}
      />
      <EnvironmentFields view={view} />
      <ServerFields view={view} />
      <TunnelFields view={view} />
      <AdvancedSection view={view} />
    </div>
    <FormFooter view={view} />
  </form>
)

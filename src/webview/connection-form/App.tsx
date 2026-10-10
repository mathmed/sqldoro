import type { ReactElement } from 'react'

import { shownIssues } from '../../core/connection-form/form-state.ts'
import { ConfigTabs } from './ConfigTabs.tsx'
import { EngineRow } from './EngineRow.tsx'
import type { FormApi } from './form-api.ts'
import type { FormView } from './form-view.ts'
import { FormFooter } from './FormFooter.tsx'
import { FormHeader, TITLE_ID } from './FormHeader.tsx'
import { TopRow } from './TopRow.tsx'
import { useConnectionForm } from './use-connection-form.ts'

// The connection form: the name and the safety of the connection on top, the engine, the settings
// in tabs, and the actions at the bottom. Enter in a field saves.
export const App = ({ api }: { readonly api: FormApi }): ReactElement => {
  const { state, actions } = useConnectionForm(api)
  if (state === null) {
    return <p className="empty-state">Loading the connection…</p>
  }
  const view: FormView = { state, actions, issues: shownIssues(state) }
  return (
    <form
      className="connection-form"
      aria-labelledby={TITLE_ID}
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        actions.save()
      }}
    >
      <FormHeader mode={state.setup.mode} notices={state.setup.notices} />
      <div className="form-body">
        <TopRow view={view} />
        <EngineRow view={view} />
        <ConfigTabs view={view} />
      </div>
      <FormFooter state={state} actions={actions} />
    </form>
  )
}

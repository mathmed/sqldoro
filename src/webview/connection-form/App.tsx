import type { ReactElement } from 'react'

import { shownIssues } from '../../core/connection-form/form-issues.ts'
import { FormStep } from '../../core/connection-form/form-state.ts'
import { ConnectionCard } from './ConnectionCard.tsx'
import { EnginePicker } from './EnginePicker.tsx'
import type { FormApi } from './form-api.ts'
import type { FormView } from './form-view.ts'
import { useConnectionForm } from './use-connection-form.ts'

// The connection form: the engines to choose from for a new connection, then the connection in a
// card, centered in the panel.
export const App = ({ api }: { readonly api: FormApi }): ReactElement => {
  const { state, actions } = useConnectionForm(api)
  if (state === null) {
    return <p className="empty-state">Loading the connection…</p>
  }
  const view: FormView = { state, actions, issues: shownIssues(state) }
  return (
    <main className="page">
      {state.step === FormStep.Picker ? (
        <EnginePicker view={view} />
      ) : (
        <ConnectionCard view={view} />
      )}
    </main>
  )
}

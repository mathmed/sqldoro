import type { ReactElement } from 'react'

import {
  type FormState,
  TestState,
  type TestStatus,
} from '../../core/connection-form/form-state.ts'
import type { FormActions } from './form-view.ts'

interface FormFooterProps {
  readonly state: FormState
  readonly actions: FormActions
}

function testText({ state, message }: TestStatus): string {
  switch (state) {
    case TestState.Testing:
      return 'Testing the connection…'
    case TestState.Succeeded:
      return message
    case TestState.Failed:
      return `Could not connect: ${message}`
    default:
      return ''
  }
}

// Always in sight under the fields: test, cancel or save, and how the last test or save went. A
// test or a save that runs disables its button.
export const FormFooter = ({ state, actions }: FormFooterProps): ReactElement => {
  const isTesting = state.test.state === TestState.Testing
  return (
    <footer className="form-footer">
      <button type="button" disabled={isTesting || state.isSaving} onClick={actions.test}>
        Test Connection
      </button>
      <div className="footer-status">
        <span role="status" className={`test-status ${state.test.state}`}>
          {testText(state.test)}
        </span>
        <span role="alert" className="save-notice">
          {state.notice}
        </span>
      </div>
      <button type="button" onClick={actions.cancel}>
        Cancel
      </button>
      <button type="submit" className="primary" disabled={state.isSaving}>
        {state.isSaving ? 'Saving…' : 'Save'}
      </button>
    </footer>
  )
}

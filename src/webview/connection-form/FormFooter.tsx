import type { ReactElement } from 'react'

import { FormAction, TestState, type TestStatus } from '../../core/connection-form/form-state.ts'
import { submit } from '../../core/connection-form/form-submit.ts'
import type { FormView } from './form-view.ts'
import { Icon, IconName } from './icons.tsx'

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

// Under the fields, inside the card: Test and how it went on the left; Cancel and Save on the
// right, with why a save was refused. A test or a save that runs disables its button.
export const FormFooter = ({ view }: { readonly view: FormView }): ReactElement => {
  const { test, isSaving, notice } = view.state
  return (
    <footer className="card-footer">
      <TestButton view={view} />
      <div className="footer-status">
        <span role="status" className={`test-status ${test.state}`}>
          {testText(test)}
        </span>
        <span role="alert" className="save-notice">
          {notice}
        </span>
      </div>
      <button type="button" className="quiet" onClick={view.actions.cancel}>
        Cancel
      </button>
      <button type="submit" className="primary" disabled={isSaving}>
        {isSaving ? 'Saving…' : 'Save connection'}
      </button>
    </footer>
  )
}

const TestButton = ({ view }: { readonly view: FormView }): ReactElement => (
  <button
    type="button"
    className="test-button"
    title="Test the connection"
    disabled={view.state.test.state === TestState.Testing || view.state.isSaving}
    onClick={() => {
      view.actions.update((state) => submit(state, FormAction.Test))
    }}
  >
    <Icon name={IconName.Zap} />
    Test
  </button>
)

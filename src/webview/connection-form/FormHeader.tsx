import type { ReactElement } from 'react'

import { FormMode } from '../../core/connection-form/protocol.ts'

interface FormHeaderProps {
  readonly mode: FormMode
  readonly notices: readonly string[]
}

export const TITLE_ID = 'form-title'

// The title with the icon of sqldoro, then what the extension has to say about the connection,
// such as the parameters of an imported URL it ignored.
export const FormHeader = ({ mode, notices }: FormHeaderProps): ReactElement => (
  <>
    <header className="form-header">
      <span className="form-icon" aria-hidden="true" />
      <h1 id={TITLE_ID}>{mode === FormMode.Edit ? 'Edit Connection' : 'New Connection'}</h1>
    </header>
    {notices.length === 0 ? null : (
      <div role="note" aria-label="About this connection" className="form-notice">
        <ul>
          {[...new Set(notices)].map((notice) => (
            <li key={notice}>{notice}</li>
          ))}
        </ul>
      </div>
    )}
  </>
)

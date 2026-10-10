import type { ReactElement } from 'react'

import {
  type PathField as PathFieldName,
  pathOf,
  withPath,
} from '../../core/connection/transitions.ts'
import { describedBy, FieldFrame } from './controls.tsx'
import { type FieldSpec, type FormView, specOf } from './form-view.ts'

interface PathFieldProps {
  readonly view: FormView
  readonly field: PathFieldName
  readonly isRequired?: boolean
}

// The path of a file, typed or chosen with the file dialog of VS Code (a webview cannot open one).
export const PathField = ({ view, field, isRequired = false }: PathFieldProps): ReactElement => {
  const spec = specOf(view, field, isRequired)
  const path = pathOf(view.state.draft.connection, field)
  const on = pathActions(view, field)
  return (
    <FieldFrame spec={spec}>
      <span className="input-row">
        <PathInput spec={spec} path={path} onChange={on.write} onBlur={on.touch} />
        <PathButtons
          path={path}
          name={spec.label.toLowerCase()}
          onBrowse={on.browse}
          onClear={on.clear}
        />
      </span>
    </FieldFrame>
  )
}

interface PathActions {
  readonly write: (path: string) => void
  readonly touch: () => void
  readonly browse: () => void
  readonly clear: () => void
}

function pathActions(view: FormView, field: PathFieldName): PathActions {
  const write = (path: string): void => {
    view.actions.edit(field, (connection) => withPath(connection, field, path))
  }
  return {
    write,
    touch: () => {
      view.actions.touch(field)
    },
    browse: () => {
      view.actions.browse(field)
    },
    clear: () => {
      write('')
    },
  }
}

interface PathInputProps {
  readonly spec: FieldSpec
  readonly path: string
  readonly onChange: (path: string) => void
  readonly onBlur: () => void
}

const PathInput = ({ spec, path, onChange, onBlur }: PathInputProps): ReactElement => (
  <input
    id={spec.id}
    type="text"
    value={path}
    placeholder="Path of the file"
    spellCheck={false}
    autoComplete="off"
    {...describedBy(spec)}
    onChange={(event) => {
      onChange(event.target.value)
    }}
    onBlur={onBlur}
  />
)

interface PathButtonsProps {
  readonly path: string
  readonly name: string
  readonly onBrowse: () => void
  readonly onClear: () => void
}

const PathButtons = ({ path, name, onBrowse, onClear }: PathButtonsProps): ReactElement => (
  <>
    <button type="button" aria-label={`Browse for the ${name}`} onClick={onBrowse}>
      Browse…
    </button>
    {path === '' ? null : (
      <button type="button" aria-label={`Clear the ${name}`} onClick={onClear}>
        Clear
      </button>
    )}
  </>
)

import type { ReactElement } from 'react'

import {
  type PathField as PathFieldName,
  pathOf,
  withPath,
} from '../../core/connection/transitions.ts'
import { describedBy, FieldFrame } from './controls.tsx'
import { edit, type FieldSpec, type FormView, specOf, touch } from './form-view.ts'

interface PathFieldProps {
  readonly view: FormView
  readonly field: PathFieldName
  readonly isRequired?: boolean
}

// The path of a file, typed or chosen with the file dialog of VS Code (a webview cannot open one).
export const PathField = ({ view, field, isRequired = false }: PathFieldProps): ReactElement => {
  const spec = specOf(view, field, isRequired)
  return (
    <FieldFrame spec={spec}>
      <span className="input-row">
        <PathInput view={view} field={field} spec={spec} />
        <PathButtons view={view} field={field} name={spec.label.toLowerCase()} />
      </span>
    </FieldFrame>
  )
}

interface PathPartProps {
  readonly view: FormView
  readonly field: PathFieldName
}

function writePath({ view, field }: PathPartProps, path: string): void {
  edit(view, field, (connection) => withPath(connection, field, path))
}

const PathInput = (props: PathPartProps & { readonly spec: FieldSpec }): ReactElement => {
  const { view, field, spec } = props
  return (
    <input
      id={spec.id}
      type="text"
      value={pathOf(view.state.draft.connection, field)}
      placeholder="Path of the file"
      spellCheck={false}
      autoComplete="off"
      {...describedBy(spec)}
      onChange={(event) => {
        writePath(props, event.target.value)
      }}
      onBlur={() => {
        touch(view, field)
      }}
    />
  )
}

// Browse opens the file dialog of VS Code; Clear shows once there is a path to clear.
const PathButtons = (props: PathPartProps & { readonly name: string }): ReactElement => {
  const { view, field, name } = props
  return (
    <>
      <button
        type="button"
        aria-label={`Browse for the ${name}`}
        onClick={() => {
          view.actions.browse(field)
        }}
      >
        Browse…
      </button>
      {pathOf(view.state.draft.connection, field) === '' ? null : (
        <button
          type="button"
          aria-label={`Clear the ${name}`}
          onClick={() => {
            writePath(props, '')
          }}
        >
          Clear
        </button>
      )}
    </>
  )
}

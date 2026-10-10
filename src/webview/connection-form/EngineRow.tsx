import type { KeyboardEvent, ReactElement } from 'react'

import { withEngine } from '../../core/connection/transitions.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import type { EngineOption } from '../../core/engine/engine.ts'
import { steppedItem } from './arrow-keys.ts'
import { fieldId, type FormView } from './form-view.ts'

const LABEL_ID = 'server-type-label'
const ISSUE_ID = 'server-type-issue'

function engineId(engine: EngineOption): string {
  return `engine-${engine.id}`
}

// The engines the extension registered, as a row of radio buttons: the chosen one is underlined.
// A new engine brings its default port unless the port was changed.
export const EngineRow = ({ view }: { readonly view: FormView }): ReactElement => {
  const issue = view.issues.get(ConnectionField.Engine)
  return (
    <div className="server-type">
      <span id={LABEL_ID} className="section-label">
        Server type
      </span>
      <EngineRadios view={view} isInvalid={issue !== undefined} />
      {issue === undefined ? null : (
        <p id={ISSUE_ID} className="field-issue">
          {issue}
        </p>
      )}
    </div>
  )
}

interface EngineRadiosProps {
  readonly view: FormView
  readonly isInvalid: boolean
}

interface Radios {
  readonly selected: number
  readonly choose: (engine: EngineOption) => void
  readonly onKeyDown: (event: KeyboardEvent) => void
}

// The arrow keys move along the engines and choose them, as in any radio group.
function radiosOf(view: FormView): Radios {
  const { engines } = view.state.setup
  const selected = engines.findIndex((engine) => engine.id === view.state.draft.connection.engine)
  const choose = (engine: EngineOption): void => {
    view.actions.edit(ConnectionField.Engine, (connection) =>
      withEngine(connection, engine, engines),
    )
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    const next = steppedItem(engines, event.key, selected)
    if (next !== undefined) {
      event.preventDefault()
      choose(next)
      document.getElementById(engineId(next))?.focus()
    }
  }
  return { selected, choose, onKeyDown }
}

const EngineRadios = ({ view, isInvalid }: EngineRadiosProps): ReactElement => {
  const { selected, choose, onKeyDown } = radiosOf(view)
  return (
    <div
      id={fieldId(ConnectionField.Engine)}
      role="radiogroup"
      aria-labelledby={LABEL_ID}
      aria-describedby={isInvalid ? ISSUE_ID : undefined}
      className="engine-tabs"
      tabIndex={-1}
      onKeyDown={onKeyDown}
    >
      {view.state.setup.engines.map((engine, index) => (
        <EngineButton
          key={engine.id}
          engine={engine}
          isSelected={index === selected}
          isFocusable={index === Math.max(selected, 0)}
          onChoose={choose}
        />
      ))}
    </div>
  )
}

interface EngineButtonProps {
  readonly engine: EngineOption
  readonly isSelected: boolean
  readonly isFocusable: boolean
  readonly onChoose: (engine: EngineOption) => void
}

const EngineButton = ({
  engine,
  isSelected,
  isFocusable,
  onChoose,
}: EngineButtonProps): ReactElement => (
  <button
    type="button"
    role="radio"
    id={engineId(engine)}
    aria-checked={isSelected}
    tabIndex={isFocusable ? 0 : -1}
    className="engine-tab"
    onClick={() => {
      onChoose(engine)
    }}
  >
    {engine.displayName}
  </button>
)

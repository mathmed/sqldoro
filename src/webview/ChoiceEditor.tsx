import { type KeyboardEvent, type MouseEvent, type ReactElement, useEffect, useRef } from 'react'

import { setOptions, setText } from '../core/edits/values.ts'
import type { ValueSpec, ValueType } from '../core/engine/table.ts'
import { type CellEditorActions, EditorExit, onEditorKey } from './editor-keys.ts'

type ChoiceSpec = Extract<ValueSpec, { readonly type: typeof ValueType.Choice }>

interface ChoiceEditorProps {
  readonly text: string
  readonly label: string
  readonly spec: ChoiceSpec
  readonly actions: CellEditorActions
}

const STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowDown', 1],
  ['ArrowUp', -1],
])

// The value of an enum is picked from its values, those of a set are checked: nothing to type, and
// nothing the column cannot hold.
export const ChoiceEditor = (props: ChoiceEditorProps): ReactElement =>
  props.spec.isMultiple ? <SetEditor {...props} /> : <EnumEditor {...props} />

// The values of the enum: the arrows move along them, Enter puts the one chosen in, a click puts one
// in at once; Escape leaves the cell as it was.
const EnumEditor = ({ text, label, spec, actions }: ChoiceEditorProps): ReactElement => {
  const listRef = useRef<HTMLUListElement>(null)
  useEffect(() => {
    listRef.current?.focus()
  }, [])
  const { options } = spec
  const chosen = options.indexOf(text)
  return (
    <ul
      ref={listRef}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      className="choice-editor"
      onKeyDown={(event) => {
        onEnumKey(event, { options, chosen, actions })
      }}
      onMouseDown={keepInCell}
    >
      {options.map((option, index) => (
        <EnumOption key={option} option={option} isChosen={index === chosen} actions={actions} />
      ))}
    </ul>
  )
}

// A press in the editor stays in it: the grid does not select another cell.
function keepInCell(event: MouseEvent): void {
  event.stopPropagation()
}

const EnumOption = ({
  option,
  isChosen,
  actions,
}: {
  readonly option: string
  readonly isChosen: boolean
  readonly actions: CellEditorActions
}): ReactElement => (
  <li
    role="option"
    aria-selected={isChosen}
    className={isChosen ? 'choice active' : 'choice'}
    onClick={() => {
      actions.put(option, EditorExit.Stay)
    }}
  >
    {option === '' ? <span className="look-empty">(empty)</span> : option}
  </li>
)

interface EnumKeys {
  readonly options: readonly string[]
  readonly chosen: number
  readonly actions: CellEditorActions
}

function onEnumKey(event: KeyboardEvent, { options, chosen, actions }: EnumKeys): void {
  const step = STEPS.get(event.key)
  if (step === undefined) {
    onEditorKey(event, actions)
    return
  }
  event.preventDefault()
  const next = Math.min(Math.max(chosen + step, 0), options.length - 1)
  for (const option of options.slice(next, next + 1)) {
    actions.change(option)
  }
}

// The values of the set, each checked or not: Enter (or OK) puts them in, in the order of the column.
const SetEditor = ({ text, label, spec, actions }: ChoiceEditorProps): ReactElement => {
  const chosen = setOptions(text)
  const toggle = (option: string): void => {
    actions.change(setText(spec.options, toggled(chosen, option)))
  }
  return (
    <div
      role="group"
      aria-label={label}
      className="choice-editor"
      onKeyDown={(event) => {
        onEditorKey(event, actions)
      }}
      onMouseDown={keepInCell}
    >
      {spec.options.map((option, index) => (
        <SetOption
          key={option}
          option={option}
          check={{ isFirst: index === 0, isChecked: chosen.includes(option) }}
          onToggle={toggle}
        />
      ))}
      <OkButton actions={actions} />
    </div>
  )
}

const OkButton = ({ actions }: { readonly actions: CellEditorActions }): ReactElement => (
  <button
    type="button"
    className="primary"
    onClick={() => {
      actions.commit(EditorExit.Stay)
    }}
  >
    OK
  </button>
)

function toggled(chosen: readonly string[], option: string): string[] {
  return chosen.includes(option) ? chosen.filter((other) => other !== option) : [...chosen, option]
}

interface SetOptionProps {
  readonly option: string
  // The first one takes the focus as the editor opens.
  readonly check: { readonly isFirst: boolean; readonly isChecked: boolean }
  readonly onToggle: (option: string) => void
}

const SetOption = ({ option, check, onToggle }: SetOptionProps): ReactElement => (
  <label className="choice">
    <input
      type="checkbox"
      autoFocus={check.isFirst}
      checked={check.isChecked}
      onChange={() => {
        onToggle(option)
      }}
    />
    {option === '' ? <span className="look-empty">(empty)</span> : option}
  </label>
)

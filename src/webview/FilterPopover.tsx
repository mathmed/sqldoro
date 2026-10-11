import { type KeyboardEvent, type ReactElement, useRef, useState } from 'react'

import type { ColumnKind } from '../core/engine/query.ts'
import {
  type ColumnFilter,
  defaultOperator,
  isAppliedDraft,
  isFilterOperator,
  operatorLabel,
  operatorsFor,
  valueRange,
  withOperator,
} from '../core/results/conditions.ts'
import { type DistinctValues, ValueChecklist } from './FilterValues.tsx'
import { Icon, IconName } from './icons.tsx'
import { type PopupPlace, useDismiss } from './popup.ts'
import { TextButton } from './tool-buttons.tsx'

export type Condition = Pick<ColumnFilter, 'operator' | 'values'>

// The column a filter is on: its name, the kind of its values and, for an enum, the values it takes.
export interface FilteredColumn {
  readonly name: string
  readonly kind: ColumnKind
  readonly choices: readonly string[]
}

interface FilterPopoverProps {
  readonly column: FilteredColumn
  // The conditions of the column now; none without a filter.
  readonly filters: readonly Condition[]
  // The values the column holds, once asked for (a list picks from them).
  readonly distinct: DistinctValues | undefined
  readonly onFetchDistinct: () => void
  readonly place: PopupPlace
  readonly onApply: (filters: readonly Condition[]) => void
  // Closed from the keyboard or a button: the focus goes back to the header.
  readonly onClose: () => void
  // A click elsewhere: the focus stays where it went.
  readonly onDismiss: () => void
}

// A condition being typed; its id tells it apart from the others while they come and go.
interface Draft {
  readonly id: number
  readonly condition: Condition
}

// The filter of a column, under its header: one or more conditions, all of which a row meets (AND),
// with the operators that suit the kind of the column. Enter applies them, Escape closes it as it was.
export const FilterPopover = (props: FilterPopoverProps): ReactElement => {
  const { column, onClose } = props
  const [drafts, setDrafts] = useState(() => initialDrafts(props))
  const boxRef = useRef<HTMLDivElement>(null)
  useDismiss(boxRef, true, props.onDismiss)
  const apply = (conditions: readonly Condition[]): void => {
    onClose()
    props.onApply(conditions.filter((condition) => isAppliedDraft(condition, column.kind)))
  }
  const applyDrafts = (): void => {
    apply(drafts.map((draft) => draft.condition))
  }
  return (
    <div
      ref={boxRef}
      role="dialog"
      aria-label={`Filter ${column.name}`}
      className="popover filter-popover"
      style={props.place}
      onKeyDown={(event) => {
        onPopoverKey(event, { onApply: applyDrafts, onClose })
      }}
    >
      <p className="popover-title">Rows where {column.name}</p>
      <ConditionList drafts={drafts} props={props} onChange={setDrafts} />
      <PopoverActions canClear={props.filters.length > 0} onApply={applyDrafts} apply={apply} />
    </div>
  )
}

function initialDrafts({ filters, column }: FilterPopoverProps): readonly Draft[] {
  const conditions = filters.length > 0 ? filters : [freshCondition(column)]
  return conditions.map((condition, id) => ({ id, condition }))
}

function freshCondition(column: FilteredColumn): Condition {
  const operator = defaultOperator(column.kind, column.choices.length > 0)
  return withOperator({ operator, values: [] }, operator)
}

// Enter in a field applies the conditions typed (Alt+Enter adds a value to a list), Escape closes
// the filter as it was.
function onPopoverKey(
  event: KeyboardEvent,
  { onApply, onClose }: { readonly onApply: () => void; readonly onClose: () => void },
): void {
  if (event.key === 'Enter' && isPlainEnterInField(event)) {
    event.preventDefault()
    onApply()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
  }
}

function isPlainEnterInField(event: KeyboardEvent): boolean {
  const isField = event.target instanceof HTMLInputElement && event.target.type !== 'checkbox'
  return isField && !event.altKey
}

interface ConditionListProps {
  readonly drafts: readonly Draft[]
  readonly props: FilterPopoverProps
  readonly onChange: (drafts: readonly Draft[]) => void
}

const ConditionList = ({ drafts, props, onChange }: ConditionListProps): ReactElement => {
  const nextId = Math.max(...drafts.map((draft) => draft.id)) + 1
  return (
    <>
      <ol className="filter-conditions">
        {drafts.map((draft, index) => (
          <ConditionRow
            key={draft.id}
            condition={draft.condition}
            row={{ index, isOnly: drafts.length === 1, props }}
            onChange={(condition) => {
              onChange(
                condition === undefined
                  ? drafts.toSpliced(index, 1)
                  : drafts.with(index, { id: draft.id, condition }),
              )
            }}
          />
        ))}
      </ol>
      <TextButton
        label="+ And another condition"
        title="The rows shown meet every condition"
        onClick={() => {
          onChange([...drafts, { id: nextId, condition: freshCondition(props.column) }])
        }}
      />
    </>
  )
}

interface ConditionRowProps {
  readonly condition: Condition
  readonly row: {
    readonly index: number
    readonly isOnly: boolean
    readonly props: FilterPopoverProps
  }
  // Undefined removes the condition.
  readonly onChange: (condition: Condition | undefined) => void
}

const ConditionRow = ({ condition, row, onChange }: ConditionRowProps): ReactElement => {
  const { column } = row.props
  const number = String(row.index + 1)
  return (
    <li className="filter-condition" aria-label={`Condition ${number} on ${column.name}`}>
      <OperatorSelect column={column} condition={condition} onChange={onChange} />
      <ConditionValues condition={condition} props={row.props} onChange={onChange} />
      {row.isOnly ? null : (
        <button
          type="button"
          className="tool-button"
          aria-label={`Remove condition ${number}`}
          title="Remove this condition"
          onClick={() => {
            onChange(undefined)
          }}
        >
          <Icon name={IconName.Close} />
        </button>
      )}
    </li>
  )
}

interface OperatorSelectProps {
  readonly column: FilteredColumn
  readonly condition: Condition
  readonly onChange: (condition: Condition) => void
}

const OperatorSelect = ({ column, condition, onChange }: OperatorSelectProps): ReactElement => (
  <select
    aria-label="Operator"
    value={condition.operator}
    onChange={(event) => {
      const operator = event.target.value
      if (isFilterOperator(operator)) {
        onChange(withOperator(condition, operator))
      }
    }}
  >
    {operatorsFor(column.kind, column.choices.length > 0).map((operator) => (
      <option key={operator} value={operator}>
        {operatorLabel(operator)}
      </option>
    ))}
  </select>
)

interface ConditionValuesProps {
  readonly condition: Condition
  readonly props: FilterPopoverProps
  readonly onChange: (condition: Condition) => void
}

// None, one value, the two ends of a range, or the values of a list.
const ConditionValues = ({ condition, props, onChange }: ConditionValuesProps): ReactElement => {
  if (valueRange(condition.operator).max === Number.POSITIVE_INFINITY) {
    return <ListValues condition={condition} props={props} onChange={onChange} />
  }
  return (
    <span className="filter-values">
      {condition.values.map((value, index) => (
        <ValueInput
          key={valueName(index, condition.values.length)}
          value={value}
          label={`${valueName(index, condition.values.length)} ${props.column.name}`}
          choices={props.column.choices}
          onChange={(typed) => {
            onChange({ ...condition, values: condition.values.with(index, typed) })
          }}
        />
      ))}
    </span>
  )
}

const ListValues = ({ condition, props, onChange }: ConditionValuesProps): ReactElement => (
  <ValueChecklist
    options={props.column.choices}
    distinct={props.distinct}
    onFetch={props.onFetchDistinct}
    chosen={condition.values}
    onChange={(values) => {
      onChange({ ...condition, values })
    }}
  />
)

// The one value of a comparison, or the two ends of a range.
function valueName(index: number, count: number): string {
  if (count === 1) {
    return 'Value of'
  }
  return index === 0 ? 'From' : 'To'
}

interface ValueInputProps {
  readonly value: string
  readonly label: string
  // The values of an enum, to pick from; empty for a value typed.
  readonly choices: readonly string[]
  readonly onChange: (value: string) => void
}

const ValueInput = (props: ValueInputProps): ReactElement =>
  props.choices.length > 0 ? <ChoiceSelect {...props} /> : <TextValue {...props} />

const ChoiceSelect = ({ value, label, choices, onChange }: ValueInputProps): ReactElement => (
  <select
    aria-label={label}
    value={value}
    onChange={(event) => {
      onChange(event.target.value)
    }}
  >
    <option value="" disabled>
      Pick a value
    </option>
    {choices.map((choice) => (
      <option key={choice} value={choice}>
        {choice}
      </option>
    ))}
  </select>
)

const TextValue = ({ value, label, onChange }: ValueInputProps): ReactElement => (
  <input
    type="text"
    aria-label={label}
    placeholder="Value"
    spellCheck={false}
    autoFocus
    value={value}
    onChange={(event) => {
      onChange(event.target.value)
    }}
  />
)

interface PopoverActionsProps {
  readonly canClear: boolean
  readonly onApply: () => void
  readonly apply: (conditions: readonly Condition[]) => void
}

const PopoverActions = ({ canClear, onApply, apply }: PopoverActionsProps): ReactElement => (
  <span className="popover-actions">
    <button
      type="button"
      disabled={!canClear}
      onClick={() => {
        apply([])
      }}
    >
      Clear
    </button>
    <button type="button" className="primary" onClick={onApply}>
      Apply
    </button>
  </span>
)

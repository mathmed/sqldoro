import type { AriaAttributes, ReactElement, ReactNode } from 'react'

import type { FieldSpec } from './form-view.ts'

export interface Option<T extends string> {
  readonly value: T
  readonly label: string
}

interface FrameProps {
  readonly spec: FieldSpec
  readonly children: ReactNode
}

type Described = Pick<AriaAttributes, 'aria-describedby' | 'aria-invalid' | 'aria-required'>

function issueId(id: string): string {
  return `${id}-issue`
}

function helpId(id: string): string {
  return `${id}-help`
}

// What ties a control to its label's requirement, its problem and its help.
export function describedBy({ id, isRequired = false, issue, help }: FieldSpec): Described {
  const ids = [issue === undefined ? '' : issueId(id), help === undefined ? '' : helpId(id)].filter(
    (part) => part !== '',
  )
  return {
    'aria-invalid': issue !== undefined,
    'aria-required': isRequired,
    'aria-describedby': ids.length === 0 ? undefined : ids.join(' '),
  }
}

// A label on the left of its control, with the problem of the field, then its help, under it.
export const FieldFrame = ({ spec, children }: FrameProps): ReactElement => (
  <div className="field">
    <label className="field-label" htmlFor={spec.id}>
      {spec.label}
      {spec.isRequired === true ? (
        <span className="required" aria-hidden="true">
          *
        </span>
      ) : null}
    </label>
    <div className="field-control">
      {children}
      {spec.issue === undefined ? null : (
        <p id={issueId(spec.id)} className="field-issue">
          {spec.issue}
        </p>
      )}
      {spec.help === undefined ? null : (
        <p id={helpId(spec.id)} className="field-help">
          {spec.help}
        </p>
      )}
    </div>
  </div>
)

// One or two fields side by side; a narrow panel stacks them.
export const FieldRow = ({ children }: { readonly children: ReactNode }): ReactElement => (
  <div className="field-row">{children}</div>
)

interface TextInputProps {
  readonly spec: FieldSpec
  readonly value: string
  readonly placeholder?: string | undefined
  readonly className?: string
  readonly inputMode?: 'numeric'
  readonly onChange: (value: string) => void
  readonly onBlur: () => void
}

export const TextInput = ({ spec, value, onChange, ...options }: TextInputProps): ReactElement => (
  <FieldFrame spec={spec}>
    <input
      id={spec.id}
      type="text"
      className={options.className}
      inputMode={options.inputMode}
      value={value}
      placeholder={options.placeholder}
      spellCheck={false}
      autoComplete="off"
      {...describedBy(spec)}
      onChange={(event) => {
        onChange(event.target.value)
      }}
      onBlur={options.onBlur}
    />
  </FieldFrame>
)

interface SelectInputProps<T extends string> {
  readonly spec: FieldSpec
  readonly value: T
  readonly options: readonly Option<T>[]
  readonly onSelect: (value: T) => void
}

// Only one of its options is ever chosen: any other value is ignored.
export const SelectInput = <T extends string>({
  spec,
  value,
  options,
  onSelect,
}: SelectInputProps<T>): ReactElement => (
  <FieldFrame spec={spec}>
    <select
      id={spec.id}
      value={value}
      {...describedBy(spec)}
      onChange={(event) => {
        const chosen = options.find((option) => option.value === event.target.value)
        if (chosen !== undefined) {
          onSelect(chosen.value)
        }
      }}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  </FieldFrame>
)

interface SwitchInputProps {
  readonly spec: FieldSpec
  readonly isOn: boolean
  readonly onToggle: (isOn: boolean) => void
}

export const SwitchInput = ({ spec, isOn, onToggle }: SwitchInputProps): ReactElement => (
  <FieldFrame spec={spec}>
    <input
      id={spec.id}
      type="checkbox"
      role="switch"
      className="switch"
      checked={isOn}
      {...describedBy(spec)}
      onChange={(event) => {
        onToggle(event.target.checked)
      }}
    />
  </FieldFrame>
)

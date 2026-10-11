import type { CSSProperties, KeyboardEvent, ReactElement } from 'react'

import { policyOf } from '../../core/connection-form/form-state.ts'
import { EnvironmentTag } from '../../core/connection/connection.ts'
import {
  ENVIRONMENT_COLORS,
  ENVIRONMENT_SHORT_LABELS,
  labelOf,
} from '../../core/connection/labels.ts'
import { withEnvironment } from '../../core/safety/guard.ts'
import { themeColor } from '../theme-color.ts'
import { steppedItem } from './arrow-keys.ts'
import { SwitchInput } from './controls.tsx'
import { edit, type FormView } from './form-view.ts'

const TAGS: readonly EnvironmentTag[] = Object.values(EnvironmentTag)
const LABEL_ID = 'environment-label'
const READ_ONLY_HELP = 'sqldoro and the database session refuse writes. Recommended.'

function segmentId(tag: EnvironmentTag): string {
  return `environment-${tag}`
}

// The dot of an environment takes its color in the explorer; an untagged one stays hollow.
function dotStyle(tag: EnvironmentTag): CSSProperties | undefined {
  const color = ENVIRONMENT_COLORS.get(tag)
  return color === undefined ? undefined : { backgroundColor: themeColor(color) }
}

// The safety of the connection, on the first screen: its environment, and whether it refuses
// writes. A production environment turns read-only on.
export const EnvironmentFields = ({ view }: { readonly view: FormView }): ReactElement => (
  <>
    <EnvironmentField view={view} />
    <SwitchInput
      spec={{ id: 'read-only', label: 'Read-only', help: READ_ONLY_HELP }}
      isOn={view.state.draft.connection.isReadOnly}
      onToggle={(isReadOnly) => {
        edit(view, null, (connection) => ({ ...connection, isReadOnly }))
      }}
    />
  </>
)

const EnvironmentField = ({ view }: { readonly view: FormView }): ReactElement => (
  <div className="field">
    <span id={LABEL_ID} className="field-label">
      Environment
    </span>
    <div className="field-control">
      <EnvironmentRadios view={view} />
    </div>
  </div>
)

// The environments side by side, as radio buttons: the arrow keys move along them and choose.
const EnvironmentRadios = ({ view }: { readonly view: FormView }): ReactElement => {
  const selected = TAGS.indexOf(view.state.draft.connection.environment)
  const choose = (tag: EnvironmentTag): void => {
    const policy = policyOf(view.state.setup)
    edit(view, null, (connection) => withEnvironment(connection, tag, policy))
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    const next = steppedItem(TAGS, event.key, selected)
    if (next !== undefined) {
      event.preventDefault()
      choose(next)
      document.getElementById(segmentId(next))?.focus()
    }
  }
  return (
    <div role="radiogroup" aria-labelledby={LABEL_ID} className="segmented" onKeyDown={onKeyDown}>
      {TAGS.map((tag, index) => (
        <Segment
          key={tag}
          tag={tag}
          isSelected={index === selected}
          isFocusable={index === Math.max(selected, 0)}
          onChoose={choose}
        />
      ))}
    </div>
  )
}

interface SegmentProps {
  readonly tag: EnvironmentTag
  readonly isSelected: boolean
  readonly isFocusable: boolean
  readonly onChoose: (tag: EnvironmentTag) => void
}

const Segment = ({ tag, isSelected, isFocusable, onChoose }: SegmentProps): ReactElement => (
  <button
    type="button"
    role="radio"
    id={segmentId(tag)}
    aria-checked={isSelected}
    tabIndex={isFocusable ? 0 : -1}
    className="segment"
    onClick={() => {
      onChoose(tag)
    }}
  >
    <span className="environment-dot" style={dotStyle(tag)} aria-hidden="true" />
    {labelOf(ENVIRONMENT_SHORT_LABELS, tag)}
  </button>
)

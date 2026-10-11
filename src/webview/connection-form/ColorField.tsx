import type { KeyboardEvent, ReactElement } from 'react'

import { ConnectionColor } from '../../core/connection/connection.ts'
import {
  CONNECTION_COLOR_LABELS,
  CONNECTION_COLORS,
  labelOf,
} from '../../core/connection/labels.ts'
import { themeColor } from '../theme-color.ts'
import { steppedItem } from './arrow-keys.ts'
import { edit, type FormView } from './form-view.ts'

const COLORS: readonly ConnectionColor[] = Object.values(ConnectionColor)
const LABEL_ID = 'color-label'
const HELP =
  'Tints the connection in the explorer and the badge of its editors and panels. Production stays red.'

function swatchId(color: ConnectionColor): string {
  return `color-${color === ConnectionColor.None ? 'none' : color}`
}

// The color of the connection, as a row of swatches of the theme's chart colors, and none.
export const ColorField = ({ view }: { readonly view: FormView }): ReactElement => (
  <div className="field">
    <span id={LABEL_ID} className="field-label">
      Color
    </span>
    <div className="field-control">
      <Swatches view={view} />
      <p className="field-help">{HELP}</p>
    </div>
  </div>
)

// The swatches side by side, as radio buttons: the arrow keys move along them and choose.
const Swatches = ({ view }: { readonly view: FormView }): ReactElement => {
  const selected = COLORS.indexOf(view.state.draft.connection.color)
  const choose = (color: ConnectionColor): void => {
    edit(view, null, (connection) => ({ ...connection, color }))
  }
  const onKeyDown = (event: KeyboardEvent): void => {
    const next = steppedItem(COLORS, event.key, selected)
    if (next !== undefined) {
      event.preventDefault()
      choose(next)
      document.getElementById(swatchId(next))?.focus()
    }
  }
  return (
    <div role="radiogroup" aria-labelledby={LABEL_ID} className="swatches" onKeyDown={onKeyDown}>
      {COLORS.map((color, index) => (
        <Swatch
          key={color}
          color={color}
          isSelected={index === selected}
          isFocusable={index === Math.max(selected, 0)}
          onChoose={choose}
        />
      ))}
    </div>
  )
}

interface SwatchProps {
  readonly color: ConnectionColor
  readonly isSelected: boolean
  readonly isFocusable: boolean
  readonly onChoose: (color: ConnectionColor) => void
}

const Swatch = ({ color, isSelected, isFocusable, onChoose }: SwatchProps): ReactElement => {
  const theme = CONNECTION_COLORS.get(color)
  return (
    <button
      type="button"
      role="radio"
      id={swatchId(color)}
      aria-checked={isSelected}
      aria-label={labelOf(CONNECTION_COLOR_LABELS, color)}
      title={labelOf(CONNECTION_COLOR_LABELS, color)}
      tabIndex={isFocusable ? 0 : -1}
      className={theme === undefined ? 'swatch swatch-none' : 'swatch'}
      style={theme === undefined ? undefined : { backgroundColor: themeColor(theme) }}
      onClick={() => {
        onChoose(color)
      }}
    />
  )
}

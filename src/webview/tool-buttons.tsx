import type { ReactElement, ReactNode } from 'react'

import { Icon, type IconName } from './icons.tsx'

export interface ToolButtonProps {
  readonly icon: IconName
  // What the button is called by screen readers.
  readonly label: string
  // What it does, a shortcut that does it too, or why it is off.
  readonly tooltip: string
  readonly isDisabled: boolean
  readonly onClick: () => void
}

// A button that is off stays a button that can be hovered and focused (aria-disabled, not
// disabled, which takes the hover away in some browsers): its tooltip still says what it does, or
// why it is off. Its clicks do nothing.
function whenEnabled(isDisabled: boolean, onClick: () => void): () => void {
  return () => {
    if (!isDisabled) {
      onClick()
    }
  }
}

// A compact button that is only an icon, with a tooltip, as in VS Code's toolbars.
export const ToolButton = (props: ToolButtonProps): ReactElement => (
  <button
    type="button"
    className="tool-button"
    aria-label={props.label}
    title={props.tooltip}
    aria-disabled={props.isDisabled}
    onClick={whenEnabled(props.isDisabled, props.onClick)}
  >
    <Icon name={props.icon} />
  </button>
)

interface ToolToggleProps extends Omit<ToolButtonProps, 'onClick'> {
  readonly isOn: boolean
  readonly onChange: (isOn: boolean) => void
}

// An icon button that stays pressed while what it turns on is on.
export const ToolToggle = (props: ToolToggleProps): ReactElement => (
  <button
    type="button"
    className="tool-button"
    aria-label={props.label}
    aria-pressed={props.isOn}
    title={props.tooltip}
    aria-disabled={props.isDisabled}
    onClick={whenEnabled(props.isDisabled, () => {
      props.onChange(!props.isOn)
    })}
  >
    <Icon name={props.icon} />
  </button>
)

// Buttons that go together; a thin line parts the groups of a toolbar.
export const ToolGroup = ({
  label,
  children,
}: {
  readonly label: string
  readonly children: ReactNode
}): ReactElement => (
  <span className="tool-group" role="group" aria-label={label}>
    {children}
  </span>
)

// A small button that reads as a link: the actions of a popup.
export const TextButton = ({
  label,
  title,
  onClick,
}: {
  readonly label: string
  readonly title?: string
  readonly onClick: () => void
}): ReactElement => (
  <button type="button" className="link-button" title={title} onClick={onClick}>
    {label}
  </button>
)

import {
  type KeyboardEvent,
  type ReactElement,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'

import { Icon, IconName } from './icons.tsx'
import { placeUnder, type PopupPlace, useDismiss } from './popup.ts'

export interface MenuItem {
  readonly label: string
  readonly isDisabled: boolean
  readonly onSelect: () => void
}

interface MenuButtonProps {
  // What the button and its menu are called, and its tooltip.
  readonly label: string
  // What the menu does, more than its name says.
  readonly tooltip: string
  readonly icon: IconName
  readonly items: readonly MenuItem[]
  readonly isDisabled: boolean
  // A chevron after the icon says that the button opens a menu.
  readonly hasChevron: boolean
}

type Step = (index: number, count: number) => number

const ITEM = '[role="menuitem"]:not(:disabled)'
// The arrow keys move along the items, wrapping around; Home and End go to the ends.
const STEPS: ReadonlyMap<string, Step> = new Map<string, Step>([
  ['ArrowDown', (index, count) => (index + 1) % count],
  ['ArrowUp', (index, count) => (index - 1 + count) % count],
  ['Home', () => 0],
  ['End', (...[, count]) => count - 1],
])

interface OpenMenu {
  readonly place: PopupPlace | undefined
  readonly toggle: (button: HTMLButtonElement) => void
  // From the keyboard or an item: the focus goes back to the button.
  readonly close: () => void
}

// Open under the button, or closed; a click outside the anchor dismisses it.
function useOpenMenu(
  anchorRef: RefObject<HTMLElement | null>,
  buttonRef: RefObject<HTMLButtonElement | null>,
): OpenMenu {
  const [place, setPlace] = useState<PopupPlace>()
  const dismiss = (): void => {
    setPlace(undefined)
  }
  useDismiss(anchorRef, place !== undefined, dismiss)
  return {
    place,
    toggle: (button) => {
      setPlace(place === undefined ? placeUnder(button) : undefined)
    },
    close: () => {
      dismiss()
      buttonRef.current?.focus()
    },
  }
}

// A button that opens a menu under it; one that is off keeps its tooltip (aria-disabled). The menu
// takes the focus; Escape closes it and gives the focus back to the button, and a click outside
// dismisses it.
export const MenuButton = (props: MenuButtonProps): ReactElement => {
  const anchorRef = useRef<HTMLSpanElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menu = useOpenMenu(anchorRef, buttonRef)
  return (
    <span ref={anchorRef} className="menu-anchor">
      <button
        ref={buttonRef}
        type="button"
        className={props.hasChevron ? 'tool-button has-chevron' : 'header-action'}
        aria-label={props.label}
        title={props.tooltip}
        aria-haspopup="menu"
        aria-expanded={menu.place !== undefined}
        aria-disabled={props.isDisabled}
        onClick={(event) => {
          if (!props.isDisabled) {
            menu.toggle(event.currentTarget)
          }
        }}
      >
        <Icon name={props.icon} />
        {props.hasChevron ? <Icon name={IconName.ChevronDown} /> : null}
      </button>
      {menu.place === undefined ? null : (
        <MenuList label={props.label} items={props.items} place={menu.place} onClose={menu.close} />
      )}
    </span>
  )
}

interface MenuListProps {
  readonly label: string
  readonly items: readonly MenuItem[]
  readonly place: PopupPlace
  readonly onClose: () => void
}

// It takes the focus on its first item that can be picked.
export const MenuList = ({ label, items, place, onClose }: MenuListProps): ReactElement => {
  const listRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    listRef.current?.querySelector<HTMLButtonElement>(ITEM)?.focus()
  }, [])
  return (
    <div
      ref={listRef}
      role="menu"
      aria-label={label}
      className="menu"
      style={place}
      onKeyDown={(event) => {
        onMenuKey(event, onClose)
      }}
    >
      {items.map((item) => (
        <MenuEntry key={item.label} item={item} onClose={onClose} />
      ))}
    </div>
  )
}

// Picking an item closes the menu first.
const MenuEntry = ({
  item,
  onClose,
}: {
  readonly item: MenuItem
  readonly onClose: () => void
}): ReactElement => (
  <button
    type="button"
    role="menuitem"
    tabIndex={-1}
    disabled={item.isDisabled}
    onClick={() => {
      onClose()
      item.onSelect()
    }}
  >
    {item.label}
  </button>
)

function onMenuKey(event: KeyboardEvent<HTMLDivElement>, onClose: () => void): void {
  if (event.key === 'Escape' || event.key === 'Tab') {
    event.preventDefault()
    onClose()
    return
  }
  const step = STEPS.get(event.key)
  if (step !== undefined) {
    event.preventDefault()
    moveFocus(event.currentTarget, step)
  }
}

function moveFocus(menu: HTMLElement, step: Step): void {
  const items = [...menu.querySelectorAll<HTMLButtonElement>(ITEM)]
  const index = items.findIndex((item) => item === document.activeElement)
  items.at(step(index, items.length))?.focus()
}

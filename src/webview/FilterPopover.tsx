import { type KeyboardEvent, type ReactElement, useEffect, useRef, useState } from 'react'

import { type PopupPlace, useDismiss } from './popup.ts'

interface FilterPopoverProps {
  // The name of the column it filters.
  readonly name: string
  // The filter of the column now; empty without one.
  readonly text: string
  readonly place: PopupPlace
  readonly onApply: (text: string) => void
  // Closed from the keyboard or a button: the focus goes back to the header.
  readonly onClose: () => void
  // A click elsewhere: the focus stays where it went.
  readonly onDismiss: () => void
}

// The filter of a column, under its header: the rows whose value contains the text, without case.
// Enter applies it, Escape closes it; either way the focus goes back to the header.
export const FilterPopover = (props: FilterPopoverProps): ReactElement => {
  const { name, place, onClose } = props
  const [draft, setDraft] = useState(props.text)
  const boxRef = useRef<HTMLDivElement>(null)
  useDismiss(boxRef, true, props.onDismiss)
  const apply = (text: string): void => {
    onClose()
    props.onApply(text)
  }
  return (
    <div ref={boxRef} role="dialog" aria-label={`Filter ${name}`} className="popover" style={place}>
      <FilterInput
        name={name}
        draft={draft}
        onChange={setDraft}
        onApply={apply}
        onClose={onClose}
      />
      <PopoverActions
        canClear={props.text !== ''}
        onClear={() => {
          apply('')
        }}
        onApply={() => {
          apply(draft)
        }}
      />
    </div>
  )
}

interface FilterInputProps {
  readonly name: string
  readonly draft: string
  readonly onChange: (draft: string) => void
  readonly onApply: (text: string) => void
  readonly onClose: () => void
}

// It takes the focus, its text selected, as soon as the popover opens.
const FilterInput = ({
  name,
  draft,
  onChange,
  onApply,
  onClose,
}: FilterInputProps): ReactElement => {
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])
  return (
    <input
      ref={inputRef}
      type="search"
      aria-label={`Rows whose ${name} contains`}
      placeholder="Contains…"
      value={draft}
      onChange={(event) => {
        onChange(event.target.value)
      }}
      onKeyDown={(event) => {
        onFilterKey(event, { draft, onApply, onClose })
      }}
    />
  )
}

// Enter applies the filter typed, Escape closes it as it was.
function onFilterKey(
  event: KeyboardEvent,
  { draft, onApply, onClose }: Pick<FilterInputProps, 'draft' | 'onApply' | 'onClose'>,
): void {
  if (event.key === 'Enter') {
    event.preventDefault()
    onApply(draft)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    onClose()
  }
}

interface PopoverActionsProps {
  readonly canClear: boolean
  readonly onClear: () => void
  readonly onApply: () => void
}

const PopoverActions = ({ canClear, onClear, onApply }: PopoverActionsProps): ReactElement => (
  <span className="popover-actions">
    <button type="button" disabled={!canClear} onClick={onClear}>
      Clear
    </button>
    <button type="button" className="primary" onClick={onApply}>
      Apply
    </button>
  </span>
)

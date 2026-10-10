import { type InputHTMLAttributes, type KeyboardEvent, type ReactElement, useState } from 'react'

import {
  hideDatabases,
  pickDatabase,
  showDatabases,
} from '../../core/connection-form/form-databases.ts'
import {
  type DatabaseListing,
  FormAction,
  ListingState,
} from '../../core/connection-form/form-state.ts'
import { submit } from '../../core/connection-form/form-submit.ts'
import { ConnectionField } from '../../core/connection/validation.ts'
import { describedBy, FieldFrame } from './controls.tsx'
import { edit, type FieldSpec, type FormView, specOf, touch } from './form-view.ts'
import { Icon, IconName } from './icons.tsx'

const LIST_ID = 'database-options'
const LIST_TITLE = 'List the databases of the server'

interface ListProps {
  readonly view: FormView
  // The option the arrow keys are on; -1 for none.
  readonly active: number
  readonly onActive: (index: number) => void
}

// What the keys of the list do; each answers whether it did anything.
interface ListControl {
  readonly move: (step: number) => boolean
  readonly pickActive: () => boolean
  readonly hide: () => boolean
}

type InputEvents = Pick<
  InputHTMLAttributes<HTMLInputElement>,
  'onBlur' | 'onChange' | 'onClick' | 'onKeyDown'
>

// The arrow keys move along the names (showing them again), Enter picks the one they are on and
// Escape hides them; other keys type.
const LIST_KEYS: ReadonlyMap<string, (list: ListControl) => boolean> = new Map([
  ['ArrowDown', (list: ListControl) => list.move(1)],
  ['ArrowUp', (list: ListControl) => list.move(-1)],
  ['Enter', (list: ListControl) => list.pickActive()],
  ['Escape', (list: ListControl) => list.hide()],
])

function optionId(index: number): string {
  return `database-option-${String(index)}`
}

// The name the arrow keys are on, while the names show.
function activeName({ names, isOpen }: DatabaseListing, active: number): string | undefined {
  return isOpen && active >= 0 ? names.at(active) : undefined
}

// The option a step of the arrow keys moves to, round the ends: up from none is the last one.
function steppedIndex(active: number, step: number, count: number): number {
  const from = active < 0 && step < 0 ? 0 : active
  return (from + step + count) % count
}

function listingText(listing: DatabaseListing): string {
  switch (listing.state) {
    case ListingState.Listing:
      return 'Listing the databases…'
    case ListingState.Failed:
      return `Could not list the databases: ${listing.message}`
    case ListingState.Listed:
      return listing.names.length === 0 ? 'The server shows no database to this user' : ''
    default:
      return ''
  }
}

// The database to open: typed, or picked from those the server lists, which show under the field.
export const DatabaseField = ({ view }: { readonly view: FormView }): ReactElement => {
  const spec = specOf(view, ConnectionField.Database)
  const [active, setActive] = useState(-1)
  const { databases } = view.state
  return (
    <FieldFrame spec={spec} after={<ListingNote listing={databases} />}>
      <span className="input-box">
        <DatabaseInput view={view} spec={spec} active={active} onActive={setActive} />
        <ListButton view={view} />
      </span>
      {databases.isOpen ? <DatabaseOptions view={view} active={active} /> : null}
    </FieldFrame>
  )
}

const DatabaseInput = (props: ListProps & { readonly spec: FieldSpec }): ReactElement => {
  const { view, spec, active } = props
  const name = activeName(view.state.databases, active)
  return (
    <input
      id={spec.id}
      type="text"
      role="combobox"
      aria-autocomplete="list"
      aria-expanded={view.state.databases.isOpen}
      aria-controls={LIST_ID}
      aria-activedescendant={name === undefined ? undefined : optionId(active)}
      value={view.state.draft.connection.database}
      placeholder="Default database"
      spellCheck={false}
      autoComplete="off"
      {...describedBy(spec)}
      {...inputEvents(props)}
    />
  )
}

function inputEvents(props: ListProps): InputEvents {
  const { view } = props
  return {
    onChange: (event) => {
      const database = event.target.value
      edit(view, ConnectionField.Database, (connection) => ({ ...connection, database }))
    },
    onClick: () => {
      view.actions.update(showDatabases)
    },
    onBlur: () => {
      touch(view, ConnectionField.Database)
      view.actions.update(hideDatabases)
    },
    onKeyDown: (event: KeyboardEvent) => {
      if (LIST_KEYS.get(event.key)?.(listControl(props)) === true) {
        event.preventDefault()
      }
    },
  }
}

function listControl({ view, active, onActive }: ListProps): ListControl {
  const { names, isOpen } = view.state.databases
  const name = activeName(view.state.databases, active)
  return {
    move: (step) => {
      if (names.length > 0) {
        view.actions.update(showDatabases)
        onActive(steppedIndex(active, step, names.length))
      }
      return names.length > 0
    },
    pickActive: () => {
      if (name !== undefined) {
        view.actions.update((state) => pickDatabase(state, name))
      }
      return name !== undefined
    },
    hide: () => {
      view.actions.update(hideDatabases)
      return isOpen
    },
  }
}

// Lists the databases with the connection as it is typed; a listing that runs disables it.
const ListButton = ({ view }: { readonly view: FormView }): ReactElement => (
  <button
    type="button"
    className="icon-button"
    aria-label={LIST_TITLE}
    title={LIST_TITLE}
    disabled={view.state.databases.state === ListingState.Listing}
    onClick={() => {
      view.actions.update((state) => submit(state, FormAction.ListDatabases))
    }}
  >
    <Icon name={IconName.Refresh} />
  </button>
)

// Clicking a name keeps the focus in the input, and picks it.
const DatabaseOptions = ({ view, active }: Omit<ListProps, 'onActive'>): ReactElement => (
  <ul id={LIST_ID} role="listbox" aria-label="Databases of the server" className="options">
    {view.state.databases.names.map((name, index) => (
      <li
        key={name}
        id={optionId(index)}
        role="option"
        aria-selected={name === view.state.draft.connection.database}
        className={index === active ? 'option active' : 'option'}
        onMouseDown={(event) => {
          event.preventDefault()
        }}
        onClick={() => {
          view.actions.update((state) => pickDatabase(state, name))
        }}
      >
        {name}
      </li>
    ))}
  </ul>
)

// How the listing went: announced as it changes.
const ListingNote = ({ listing }: { readonly listing: DatabaseListing }): ReactElement => (
  <p aria-live="polite" className={`listing-note ${listing.state}`}>
    {listingText(listing)}
  </p>
)

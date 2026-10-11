import type { ReactElement } from 'react'

import type { ResultTab } from '../core/results/protocol.ts'
import { EditingState, type TabEditing } from '../core/results/tab-editing.ts'
import { plural } from '../core/results/tabs.ts'

// Whether the rows can be edited (and why not), how many changed, and what the last edit or apply
// said. What can be done with them is in the toolbar. A read-only connection is said once, by the
// lock above the results.
export const EditBar = ({
  tab,
  isConnectionReadOnly,
}: {
  readonly tab: ResultTab
  readonly isConnectionReadOnly: boolean
}): ReactElement | null => {
  const { editing } = tab
  const isSaidAbove = isConnectionReadOnly && editing.state === EditingState.ReadOnly
  if (editing.state === EditingState.None || isSaidAbove) {
    return null
  }
  return (
    <div className="edit-bar" role="region" aria-label="Editing">
      <span className="edit-status">{statusText(tab)}</span>
      <span role="status" className={editing.isNoticeError ? 'edit-notice error' : 'edit-notice'}>
        {editing.notice}
      </span>
    </div>
  )
}

function statusText(tab: ResultTab): string {
  const { editing } = tab
  switch (editing.state) {
    case EditingState.Checking:
      return 'Checking whether these rows can be edited…'
    case EditingState.ReadOnly:
      return `Read-only: ${editing.problem}`
    case EditingState.Applying:
      return `Applying the changes to ${editing.table}…`
    default:
      return `Editing ${editing.table}, rows told apart by ${editing.key.join(', ')}${changesText(editing, tab.search)}`
  }
}

// How many rows changed, and how many of them the filters (or the quick search) hide.
function changesText(editing: TabEditing, search: string): string {
  const count = editing.rows.length + editing.newRows.length + editing.hiddenRows
  if (count === 0) {
    return ''
  }
  const hiders = search === '' ? 'the filters' : 'the filters or the search'
  const hidden =
    editing.hiddenRows === 0 ? '' : `, ${String(editing.hiddenRows)} hidden by ${hiders}`
  return ` · ${plural(count, 'changed row', 'changed rows')}${hidden}`
}

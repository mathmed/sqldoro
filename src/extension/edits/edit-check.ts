import { type Editability, editableTable, resultOrigin } from '../../core/edits/editability.ts'
import { selectShape } from '../../core/edits/select-shape.ts'
import type { Logger } from '../../core/platform.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import { describeError } from '../../core/text/errors.ts'
import type { RunParts } from '../editor/run-types.ts'

// Whether the rows of a tab that just ran can be edited, and how: what its text says, the table
// the server says its columns come from, and that table in the catalog (read on the session of the
// explorer, so that the editor's own session and its transaction stay as they are). The tab shows
// it once known, unless its rows changed meanwhile.
export async function checkEditing(parts: RunParts, tab: ResultSet, log: Logger): Promise<void> {
  const check = tab.editor.startCheck()
  parts.panel.updateTab(tab, true)
  const editability = await editabilityOf(parts, tab).catch((error: unknown) => {
    log.warn(`Could not tell whether a result can be edited: ${describeError(error)}`)
    return { problem: `sqldoro could not read the table of these rows: ${describeError(error)}` }
  })
  if (tab.editor.finishCheck(check, editability)) {
    parts.panel.updateTab(tab, true)
  }
}

async function editabilityOf({ target, catalog }: RunParts, tab: ResultSet): Promise<Editability> {
  if (target.connection.isReadOnly) {
    return { problem: `"${target.connection.name}" is read-only: allow writes on it to edit rows.` }
  }
  const shape = selectShape(tab.sql, target.engine.dialect)
  if ('problem' in shape) {
    return shape
  }
  const origin = resultOrigin(tab.columns)
  if ('problem' in origin) {
    return origin
  }
  const description = await catalog.describeTable(target.scope.database, origin.table)
  return editableTable({ reference: shape.table, columns: tab.columns, description })
}

import { type ReactElement, useRef } from 'react'

import type { ResultTab } from '../core/results/protocol.ts'
import { costText } from '../core/results/tabs.ts'
import { Icon, IconName } from './icons.tsx'
import { QueryField } from './QueryField.tsx'
import { QueryGrip } from './QueryGrip.tsx'
import { selectionOf } from './text-selection.ts'
import { ToolButton } from './tool-buttons.tsx'
import type { QueryBoxView } from './use-query-box.ts'
import type { WhereSql } from './where-source.ts'

interface QueryBoxProps {
  readonly view: QueryBoxView
  readonly sql: WhereSql
  // The result on screen: what it cost, or why it failed.
  readonly tab: ResultTab
}

// The whole query of a table panel above its rows, to edit and run in place: colored as it is
// typed, with the columns, tables, keywords and values of enums suggested. Ctrl+Enter (or Run) runs
// it, or the text selected in it; the result replaces the rows below. Its lower edge resizes it.
export const QueryBox = ({ view, sql, tab }: QueryBoxProps): ReactElement => {
  const fieldRef = useRef<HTMLTextAreaElement>(null)
  const run = (): void => {
    view.run(selectionOf(fieldRef.current))
  }
  return (
    <section className="query-box" aria-label="Query">
      <QueryBar view={view} tab={tab} onRun={run} />
      <QueryField view={view} sql={sql} fieldRef={fieldRef} onRun={run} />
      <QueryGrip size={view.size} />
    </section>
  )
}

interface QueryBarProps {
  readonly view: QueryBoxView
  readonly tab: ResultTab
  readonly onRun: () => void
}

// Run (or cancel), what the last run cost, and the ways out: back to the query of the rows, to an
// SQL editor, to the WHERE.
const QueryBar = ({ view, tab, onRun }: QueryBarProps): ReactElement => (
  <div className="query-bar">
    <RunButton view={view} onRun={onRun} />
    <QueryStatus view={view} tab={tab} />
    <span className="toolbar-fill" />
    <ToolButton
      icon={IconName.Discard}
      label="Revert the Query"
      tooltip="Give up what you wrote: back to the query of the rows shown"
      isDisabled={!view.hasDraft}
      onClick={view.revert}
    />
    <ToolButton
      icon={IconName.ArrowLink}
      label="Open in SQL Editor"
      tooltip="Open this query in a new SQL editor, on the connection of the panel"
      isDisabled={false}
      onClick={view.openInEditor}
    />
    <ToolButton
      icon={IconName.Collapse}
      label="Close the Query"
      tooltip="Back to the WHERE of the table (Ctrl+Shift+E)"
      isDisabled={false}
      onClick={view.toggle}
    />
  </div>
)

const RunButton = ({
  view,
  onRun,
}: {
  readonly view: QueryBoxView
  readonly onRun: () => void
}): ReactElement =>
  view.isRunning ? (
    <button
      type="button"
      className="query-run"
      title="Cancel the query on the server"
      onClick={view.cancel}
    >
      <Icon name={IconName.Stop} />
      Cancel
    </button>
  ) : (
    <button
      type="button"
      className="query-run"
      title="Run the query, or the text selected in it (Ctrl+Enter)"
      onClick={onRun}
    >
      <Icon name={IconName.Play} />
      Run
    </button>
  )

// Why the text cannot run, the run on its way, what the last one cost, or why it failed.
const QueryStatus = ({ view, tab }: Omit<QueryBarProps, 'onRun'>): ReactElement => {
  const status = statusOf(view, tab)
  return (
    <span
      className={status.isProblem ? 'query-status is-problem' : 'query-status'}
      role="status"
      title={status.text}
    >
      {status.text}
    </span>
  )
}

interface Status {
  readonly text: string
  readonly isProblem: boolean
}

const NO_STATUS: Status = { text: '', isProblem: false }

function statusOf(view: QueryBoxView, tab: ResultTab): Status {
  if (view.problem !== '') {
    return { text: view.problem, isProblem: true }
  }
  if (view.isRunning) {
    return { text: 'Running…', isProblem: false }
  }
  return tabStatus(tab)
}

function tabStatus({ error, summary, loadedRows }: ResultTab): Status {
  if (error !== null) {
    return { text: error.message, isProblem: true }
  }
  return summary === null ? NO_STATUS : { text: costText(summary, loadedRows), isProblem: false }
}

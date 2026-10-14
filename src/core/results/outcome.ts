import type { LexicalRules } from '../sql/lexical-rules.ts'
import { keywordOf, significantTokens } from '../sql/statement-kind.ts'
import type { TabSummary } from './protocol-parts.ts'
import { type ResultTab, TabKind, TabStatus } from './protocol.ts'
import { formatDuration, groupDigits, plural } from './tabs.ts'

// Statements whose rows affected say what they did.
const ROW_VERBS: ReadonlySet<string> = new Set([
  'COPY',
  'DELETE',
  'INSERT',
  'LOAD',
  'MERGE',
  'REPLACE',
  'UPDATE',
])
// Statements named with the kind of object they act on: ALTER TABLE, CREATE INDEX, DROP VIEW.
const OBJECT_VERBS: ReadonlySet<string> = new Set(['ALTER', 'CREATE', 'DROP', 'RENAME', 'TRUNCATE'])
const OBJECT_KINDS: ReadonlySet<string> = new Set([
  'DATABASE',
  'DOMAIN',
  'EVENT',
  'EXTENSION',
  'FUNCTION',
  'INDEX',
  'POLICY',
  'PROCEDURE',
  'ROLE',
  'SCHEMA',
  'SEQUENCE',
  'TABLE',
  'TABLESPACE',
  'TRIGGER',
  'TYPE',
  'USER',
  'VIEW',
])
// How far after its verb the kind of object is looked for: CREATE OR REPLACE TEMPORARY VIEW.
const OBJECT_WINDOW = 4
const UNNAMED = 'Statement'
const LIST_SEPARATOR = '; '
const NOTE_SEPARATOR = '. '

type TabShape = Pick<ResultTab, 'columns' | 'kind' | 'status'>

// A statement that ran to its end without a result set (UPDATE, ALTER TABLE, SET): it has an
// outcome to tell, not rows to show.
export function isOutcome(tab: TabShape): boolean {
  return tab.kind === TabKind.Rows && tab.status === TabStatus.Succeeded && tab.columns.length === 0
}

// What only a result view can show: rows (or their columns, before them), a plan, an error, a run
// cancelled. A statement still running without columns may yet end with an outcome only.
export function needsView(tab: TabShape): boolean {
  return (
    tab.columns.length > 0 ||
    tab.kind === TabKind.Plan ||
    tab.status === TabStatus.Failed ||
    tab.status === TabStatus.Cancelled
  )
}

// The words that name what a statement does: UPDATE, ALTER TABLE, CREATE INDEX; empty when it
// starts with no word.
export function statementLabel(sql: string, rules: LexicalRules): string {
  const [verb = '', ...rest] = significantTokens(sql, rules).map(keywordOf)
  if (!OBJECT_VERBS.has(verb)) {
    return verb
  }
  const kind = rest.slice(0, OBJECT_WINDOW).find((word) => OBJECT_KINDS.has(word))
  return kind === undefined ? verb : `${verb} ${kind}`
}

// "UPDATE: 3 rows affected · 12 ms", "ALTER TABLE done · 40 ms".
export function outcomeText(label: string, summary: TabSummary | null): string {
  const done = doneText(label, summary?.affectedRows ?? null)
  return summary === null ? done : `${done} · ${formatDuration(summary.durationMs)}`
}

function doneText(label: string, affected: number | null): string {
  const what = label === '' ? UNNAMED : label
  return affected !== null && ROW_VERBS.has(label)
    ? `${what}: ${plural(affected, 'row affected', 'rows affected')}`
    : `${what} done`
}

type OutcomeTab = Pick<ResultTab, 'notice' | 'sql' | 'summary'>

// The outcome of the statement of a tab.
export function tabOutcomeText(tab: Omit<OutcomeTab, 'notice'>, rules: LexicalRules): string {
  return outcomeText(statementLabel(tab.sql, rules), tab.summary)
}

// The outcomes of a run told at once, outside a result view, with what each tab notes (the
// statements after it that did not run): one statement says its own, several say how many ran.
export function runOutcomeText(tabs: readonly OutcomeTab[], rules: LexicalRules): string {
  const outcomes = tabs.map((tab) =>
    [tabOutcomeText(tab, rules), tab.notice].filter((part) => part !== '').join(NOTE_SEPARATOR),
  )
  const count = outcomes.length === 1 ? '' : `${groupDigits(outcomes.length)} statements ran: `
  return `${count}${outcomes.join(LIST_SEPARATOR)}`
}

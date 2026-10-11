import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { bindingScope, type EditorBinding } from '../../core/editor/binding.ts'
import type { RunScope } from '../../core/editor/run-plan.ts'
import { type PlannedStatement, planRun } from '../../core/editor/run-plan.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { HistoryEntry } from '../../core/history/history.ts'
import type { Logger } from '../../core/platform.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { plural } from '../../core/results/tabs.ts'
import type { Session } from '../../core/session/open-session.ts'
import { changesSchema, isReadOnlyQuery } from '../../core/sql/statement-kind.ts'
import { describeError } from '../../core/text/errors.ts'
import type { Clock } from '../platform/clock.ts'
import type { ResultsPanel } from '../results/results-panel.ts'
import type { ResultsPanels } from '../results/results-panels.ts'
import type { StatementGuard } from '../safety/statement-guard.ts'
import type { Settings } from '../settings.ts'
import type { EditorTransactions } from '../transactions/editor-transactions.ts'
import { ActiveRun } from './active-run.ts'
import type { EditorBindings } from './bindings.ts'
import type { EditorSessions } from './editor-sessions.ts'
import { sourceOf } from './editor-source.ts'
import { type JobRequest, runApprovedJob } from './run-job.ts'
import type { RunParts, RunPlanner, RunTarget, RunWork } from './run-types.ts'

export interface QueryRunnerDependencies {
  readonly bindings: EditorBindings
  readonly editorSessions: EditorSessions
  readonly transactions: EditorTransactions
  readonly guard: StatementGuard
  readonly connect: (connection: ConnectionConfig) => Promise<Session>
  readonly connections: (id: string) => ConnectionConfig | undefined
  readonly engines: EngineRegistry
  readonly panels: ResultsPanels
  readonly diagnostics: vscode.DiagnosticCollection
  readonly record: (entry: HistoryEntry) => Promise<void>
  readonly onSchemaChange: (connectionId: string) => void
  readonly settings: () => Settings
  readonly clock: Clock
  readonly createId: () => string
  readonly pickBinding: () => Promise<EditorBinding | undefined>
  // Finds out whether the rows of a tab that ran can be edited; it reports what it finds itself.
  readonly checkEditing: (parts: RunParts, tab: ResultSet) => void
  readonly log: Logger
}

// The statements of an editor to run, from its document.
interface EditorStatements {
  readonly document: vscode.TextDocument
  readonly statements: readonly PlannedStatement[]
}

const BUSY = 'A query is already running in this editor: cancel it first.'
const DROP_CHANGES = 'Drop the Changes and Run'

// Runs the statements of SQL editors and of table panels, one run per source at a time, each on its
// own connection, into its result panel. Nothing runs before the guards approve it.
export class QueryRunner implements vscode.Disposable {
  readonly #dependencies: QueryRunnerDependencies
  readonly #runs = new Map<string, ActiveRun>()
  readonly #changes = new vscode.EventEmitter<vscode.Uri>()
  readonly onDidChangeRunning = this.#changes.event

  constructor(dependencies: QueryRunnerDependencies) {
    this.#dependencies = dependencies
  }

  isRunning(uri: vscode.Uri): boolean {
    return this.#runs.has(uri.toString())
  }

  async run(editor: vscode.TextEditor, scope: RunScope): Promise<void> {
    const { document } = editor
    if (!(await this.confirmDropChanges(document.uri))) {
      return
    }
    await this.perform(document.uri, async (target) => {
      const statements = planRun(sourceOf(editor), scope, target.engine.dialect.lexical)
      if (statements.length === 0) {
        void vscode.window.showInformationMessage(
          'There is no statement to run here: write one, select it or put the cursor on it.',
        )
        return Promise.resolve(undefined)
      }
      return Promise.resolve({
        statements: statements.map((statement) => statement.sql),
        run: async (parts: RunParts) => {
          this.startRun(parts)
          await this.#runAll(parts, { document, statements })
        },
      })
    })
  }

  // Runs what `plan` decides on the source `uri`: the document of an editor, or a table panel.
  async perform(uri: vscode.Uri, plan: RunPlanner): Promise<void> {
    const target = await this.#target(uri)
    const work = target === undefined ? undefined : await plan(target)
    if (target !== undefined && work !== undefined) {
      await this.#withRun(target, work)
    }
  }

  // Holds the editor while `action` runs: one run, commit or rollback per editor at a time.
  async exclusive(uri: vscode.Uri, action: (run: ActiveRun) => Promise<void>): Promise<void> {
    const key = uri.toString()
    if (this.#runs.has(key)) {
      void vscode.window.showInformationMessage(BUSY)
      return
    }
    const run = new ActiveRun()
    this.#runs.set(key, run)
    this.#changes.fire(uri)
    try {
      await action(run)
    } catch (error) {
      const message = describeError(error)
      this.#dependencies.panels.get(uri)?.failRunning(message)
      void vscode.window.showErrorMessage(`Could not run the query: ${message}`)
    } finally {
      this.#runs.delete(key)
      this.#changes.fire(uri)
    }
  }

  // A new run replaces the tabs of the panel and the errors shown in the editor.
  startRun(parts: RunParts): void {
    parts.panel.startRun(parts.target.engine.dialect)
    this.#dependencies.diagnostics.delete(parts.target.uri)
  }

  async cancel(uri: vscode.Uri): Promise<void> {
    const run = this.#runs.get(uri.toString())
    if (run === undefined) {
      return
    }
    try {
      await run.cancel()
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not cancel the query: ${describeError(error)}`)
    }
  }

  // A new run replaces the tabs of the panel: changes not applied in them go, once the user says so.
  async confirmDropChanges(uri: vscode.Uri): Promise<boolean> {
    if (this.#dependencies.panels.get(uri)?.hasChanges() !== true) {
      return true
    }
    const choice = await vscode.window.showWarningMessage(
      'The results of this editor have changes that were not applied.',
      { modal: true, detail: 'Running a query replaces the results, and drops their changes.' },
      DROP_CHANGES,
    )
    return choice === DROP_CHANGES
  }

  // Shared with EXPLAIN, the server view, loading every row and the edits: an approved statement
  // into a tab of the editor's panel. The rows of a tab that ran may then be edited.
  async runJob(parts: RunParts, job: JobRequest): Promise<boolean> {
    const tab = job.tab ?? this.#newTab(job.sql, job.kind)
    if (job.tab === undefined) {
      parts.panel.addTab(tab)
    }
    const isDone = await runApprovedJob({ ...this.#dependencies, parts }, { ...job, tab })
    if (isDone && job.kind === TabKind.Rows) {
      this.#dependencies.checkEditing(parts, tab)
    }
    return isDone
  }

  dispose(): void {
    this.#changes.dispose()
  }

  #newTab(sql: string, kind: TabKind): ResultSet {
    const id = this.#dependencies.createId()
    return new ResultSet({ values: [], id, sql, kind, canServerView: false, canRefresh: false })
  }

  async #target(uri: vscode.Uri): Promise<RunTarget | undefined> {
    const binding = await this.#bindingOf(uri)
    if (binding === undefined) {
      return undefined
    }
    const connection = this.#dependencies.connections(binding.connectionId)
    if (connection === undefined) {
      void vscode.window.showErrorMessage(
        'The connection of this editor no longer exists: choose another one.',
      )
      return undefined
    }
    const engine = this.#dependencies.engines.get(connection.engine)
    return { uri, connection, engine, scope: bindingScope(binding, engine.dialect) }
  }

  // An editor without a connection asks for one, and keeps it.
  async #bindingOf(uri: vscode.Uri): Promise<EditorBinding | undefined> {
    const { bindings, pickBinding } = this.#dependencies
    const existing = bindings.get(uri)
    if (existing !== undefined) {
      return existing
    }
    const picked = await pickBinding()
    if (picked !== undefined) {
      await bindings.set(uri, picked)
    }
    return picked
  }

  // The guards see every statement before the session opens; nothing runs without their approval.
  async #withRun(target: RunTarget, work: RunWork): Promise<void> {
    await this.exclusive(target.uri, async (run) => {
      const approval = await this.#dependencies.guard.approve({
        connection: target.connection,
        dialect: target.engine.dialect,
        statements: work.statements,
        transaction: this.#dependencies.transactions.of(target.uri.toString()),
      })
      // Cancelling while the guard waits for a confirmation runs nothing.
      if (approval !== undefined && !run.isCancelled) {
        await work.run(await this.#prepare(target, { run, approval }))
      }
    })
  }

  // The connection of the explorer opens too, so that the tree and the autocomplete follow. The
  // panel keeps its tabs: a new run replaces them (startRun), a run again on the server does not.
  async #prepare(
    target: RunTarget,
    { run, approval }: Pick<RunParts, 'approval' | 'run'>,
  ): Promise<RunParts> {
    const { connect, editorSessions, panels, settings } = this.#dependencies
    const catalog = (await connect(target.connection)).engineSession
    const session = await editorSessions.acquire(
      target.uri.toString(),
      target.connection,
      target.scope,
    )
    const panel = panels.show(target.uri)
    panel.showConnection(target.connection, settings().policy)
    return { target, session, catalog, panel, run, approval }
  }

  async #runAll(parts: RunParts, { document, statements }: EditorStatements): Promise<void> {
    for (const [index, statement] of statements.entries()) {
      const tab = new ResultSet({
        values: [],
        id: this.#dependencies.createId(),
        sql: statement.sql,
        kind: TabKind.Rows,
        canServerView: isReadOnlyQuery(statement.sql, parts.target.engine.dialect.lexical),
        canRefresh: false,
      })
      parts.panel.addTab(tab)
      const isDone = await this.runJob(parts, {
        sql: statement.sql,
        values: [],
        place: { document, offset: statement.offset, prefixLength: 0 },
        isRecorded: true,
        tab,
        kind: TabKind.Rows,
        shouldAutoLimit: true,
      })
      if (isDone) {
        this.#afterSuccess(parts, statement.sql)
      }
      if (!isDone || parts.run.isCancelled) {
        this.#notRun(parts.panel, tab, statements.length - index - 1)
        return
      }
    }
  }

  #afterSuccess(parts: RunParts, sql: string): void {
    if (changesSchema(sql, parts.target.engine.dialect.lexical)) {
      this.#dependencies.onSchemaChange(parts.target.connection.id)
    }
  }

  #notRun(panel: ResultsPanel, tab: ResultSet, remaining: number): void {
    if (remaining > 0) {
      tab.addNotice(`${plural(remaining, 'statement', 'statements')} after this one did not run.`)
      panel.updateTab(tab, true)
    }
  }
}

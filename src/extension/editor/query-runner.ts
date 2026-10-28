import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { bindingScope, type EditorBinding } from '../../core/editor/binding.ts'
import type { RunScope } from '../../core/editor/run-plan.ts'
import { planRun } from '../../core/editor/run-plan.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { HistoryEntry } from '../../core/history/history.ts'
import type { Logger } from '../../core/platform.ts'
import { TabKind } from '../../core/results/protocol.ts'
import { ResultSet } from '../../core/results/result-set.ts'
import { StatementCategory } from '../../core/safety/statement-class.ts'
import type { Session } from '../../core/session/open-session.ts'
import { changesSchema } from '../../core/sql/statement-kind.ts'
import { describeError } from '../../core/text/errors.ts'
import type { Clock } from '../platform/clock.ts'
import type { ResultsPanels } from '../results/results-panels.ts'
import type { Approval } from '../safety/approval.ts'
import type { StatementGuard } from '../safety/statement-guard.ts'
import type { Settings } from '../settings.ts'
import type { EditorTransactions } from '../transactions/editor-transactions.ts'
import { ActiveRun } from './active-run.ts'
import type { EditorBindings } from './bindings.ts'
import { runScript, type ScriptRunner } from './editor-script.ts'
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

const BUSY = 'A query is already running in this editor: cancel it first.'
const DROP_CHANGES = 'Drop the Changes and Run'

// When the result panel of a run opens: at once, or only once a tab needs it (a run of an editor
// whose statements may have only outcomes to tell, such as an UPDATE or an ALTER TABLE).
const PanelOpening = {
  Now: 'now',
  WhenNeeded: 'whenNeeded',
} as const

type PanelOpening = (typeof PanelOpening)[keyof typeof PanelOpening]

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

  // Statements without a result set open no result panel: their outcomes go to the panel when it is
  // open, to a notification otherwise, and to the history.
  async run(editor: vscode.TextEditor, scope: RunScope): Promise<void> {
    const { document } = editor
    if (!(await this.confirmDropChanges(document.uri))) {
      return
    }
    await this.#perform(document.uri, PanelOpening.WhenNeeded, async (target) => {
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
          await runScript(this.#scriptRunner(), parts, { document, statements })
        },
      })
    })
  }

  // Runs what `plan` decides on the source `uri`: the document of an editor, or a table panel.
  async perform(uri: vscode.Uri, plan: RunPlanner): Promise<void> {
    await this.#perform(uri, PanelOpening.Now, plan)
  }

  // The run holds the source from its plan on: a cancel while it plans (the catalog it reads may
  // have to connect) stops it too.
  async #perform(uri: vscode.Uri, opening: PanelOpening, plan: RunPlanner): Promise<void> {
    const target = await this.#target(uri)
    if (target !== undefined) {
      await this.exclusive(uri, async (run) => this.#planAndRun(run, target, { plan, opening }))
    }
  }

  // Holds the editor while `action` runs: one run, commit or rollback per editor at a time. A run
  // that was cancelled leaves no tab running.
  async exclusive(uri: vscode.Uri, action: (run: ActiveRun) => Promise<void>): Promise<void> {
    const key = uri.toString()
    if (this.#runs.has(key)) {
      void vscode.window.showInformationMessage(BUSY)
      return
    }
    const run = new ActiveRun()
    const started = this.#dependencies.clock.now()
    this.#runs.set(key, run)
    this.#changes.fire(uri)
    try {
      await action(run)
    } catch (error) {
      const message = describeError(error)
      this.#dependencies.panels.get(uri)?.failRunning(message)
      void vscode.window.showErrorMessage(`Could not run the query: ${message}`)
    } finally {
      this.#endRun(uri, { run, started })
    }
  }

  #endRun(
    uri: vscode.Uri,
    { run, started }: { readonly run: ActiveRun; readonly started: number },
  ): void {
    if (run.isCancelled) {
      this.#dependencies.panels.get(uri)?.cancelRunning(this.#dependencies.clock.now() - started)
    }
    this.#runs.delete(uri.toString())
    this.#changes.fire(uri)
  }

  // A new run replaces the tabs of the panel and the errors shown in the editor.
  startRun(parts: RunParts): void {
    parts.panel.startRun(parts.target.engine.dialect)
    this.#dependencies.diagnostics.delete(parts.target.uri)
  }

  // Nothing running for the source, a tab still shown running is not, and stops waiting.
  async cancel(uri: vscode.Uri): Promise<void> {
    const run = this.#runs.get(uri.toString())
    if (run === undefined) {
      this.#dependencies.panels.get(uri)?.cancelRunning(0)
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

  #scriptRunner(): ScriptRunner {
    return {
      runJob: async (parts, job) => this.runJob(parts, job),
      afterSuccess: (parts, sql) => {
        this.afterSuccess(parts, sql)
      },
      createId: this.#dependencies.createId,
    }
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

  // The guards see every statement before the session opens; nothing runs without their approval,
  // nor once the run is cancelled: a cancel ends the wait for the plan and for the session too.
  async #planAndRun(
    run: ActiveRun,
    target: RunTarget,
    { plan, opening }: { readonly plan: RunPlanner; readonly opening: PanelOpening },
  ): Promise<void> {
    const work = await this.#unlessCancelled(run, plan(target))
    if (work === undefined) {
      return
    }
    const approval = await this.#dependencies.guard.approve({
      connection: target.connection,
      dialect: target.engine.dialect,
      statements: work.statements,
      transaction: this.#dependencies.transactions.of(target.uri.toString()),
    })
    // Cancelling while the guard waits for a confirmation runs nothing.
    if (approval === undefined || run.isCancelled) {
      return
    }
    const panelOpening = openingOf(opening, { work, approval })
    const parts = await this.#unlessCancelled(
      run,
      this.#prepare(target, { run, approval }, panelOpening),
    )
    if (parts !== undefined) {
      await work.run(parts)
    }
  }

  // What `work` gives, or undefined once the run is cancelled: the run stops waiting for it. The
  // work goes on by itself, and a failure it ends with then is logged.
  async #unlessCancelled<T>(run: ActiveRun, work: Promise<T>): Promise<T | undefined> {
    work.catch((error: unknown) => {
      if (run.isCancelled) {
        this.#dependencies.log.warn(
          `What a cancelled run no longer waited for failed: ${describeError(error)}`,
        )
      }
    })
    return Promise.race([work, run.whenCancelled])
  }

  // The connection of the explorer opens too, so that the tree and the autocomplete follow. The
  // panel keeps its tabs: a new run replaces them (startRun), a run again on the server does not.
  async #prepare(
    target: RunTarget,
    { run, approval }: Pick<RunParts, 'approval' | 'run'>,
    opening: PanelOpening,
  ): Promise<RunParts> {
    const { connect, editorSessions, panels, settings } = this.#dependencies
    const catalog = (await connect(target.connection)).engineSession
    const session = await editorSessions.acquire(
      target.uri.toString(),
      target.connection,
      target.scope,
    )
    const panel =
      opening === PanelOpening.Now ? panels.show(target.uri) : panels.prepare(target.uri)
    panel.showConnection(target.connection, settings().policy)
    return { target, session, catalog, panel, run, approval }
  }

  // A statement of the user that ran: one that changed the schema refreshes the explorer.
  afterSuccess(parts: RunParts, sql: string): void {
    if (changesSchema(sql, parts.target.engine.dialect.lexical)) {
      this.#dependencies.onSchemaChange(parts.target.connection.id)
    }
  }
}

// A run that reads opens its panel at once, for its rows to show as they come.
function openingOf(
  opening: PanelOpening,
  { work, approval }: { readonly work: RunWork; readonly approval: Approval },
): PanelOpening {
  const isReading = work.statements.some(
    (sql) => approval.classOf(sql).category === StatementCategory.Read,
  )
  return isReading ? PanelOpening.Now : opening
}

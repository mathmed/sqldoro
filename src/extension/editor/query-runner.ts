import * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { bindingScope, type EditorBinding } from '../../core/editor/binding.ts'
import type { RunScope } from '../../core/editor/run-plan.ts'
import { type PlannedStatement, planRun } from '../../core/editor/run-plan.ts'
import type { ObjectScope } from '../../core/engine/catalog.ts'
import type { EngineRegistry } from '../../core/engine/engine-registry.ts'
import type { Engine } from '../../core/engine/engine.ts'
import type { QueryExecution } from '../../core/engine/query.ts'
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
import type { Settings } from '../settings.ts'
import type { EditorBindings } from './bindings.ts'
import type { EditorSessions } from './editor-sessions.ts'
import { sourceOf } from './editor-source.ts'
import { runStatement, type StatementContext, type StatementJob } from './statement-run.ts'

export interface QueryRunnerDependencies {
  readonly bindings: EditorBindings
  readonly editorSessions: EditorSessions
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
  readonly pickBinding: (document: vscode.TextDocument) => Promise<EditorBinding | undefined>
  readonly log: Logger
}

// Where an editor runs: its connection, the engine and the database and schema.
export interface RunTarget {
  readonly document: vscode.TextDocument
  readonly connection: ConnectionConfig
  readonly engine: Engine
  readonly scope: ObjectScope
}

// The run of an editor: the statement it is on, and whether the user cancelled it.
class ActiveRun {
  #execution: QueryExecution | undefined
  #isCancelled = false

  get isCancelled(): boolean {
    return this.#isCancelled
  }

  track(execution: QueryExecution): void {
    this.#execution = execution
  }

  async cancel(): Promise<void> {
    this.#isCancelled = true
    await this.#execution?.cancel()
  }
}

export interface RunParts {
  readonly target: RunTarget
  readonly session: Session
  readonly panel: ResultsPanel
  readonly run: ActiveRun
}

export type RunWork = (parts: RunParts) => Promise<void>

// Decides what to run once the editor's target is known, or nothing (undefined).
export type RunPlanner = (target: RunTarget) => Promise<RunWork | undefined>

// Runs the statements of SQL editors, one run per editor at a time, each on the editor's own
// connection, into the editor's result panel.
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
    await this.perform(editor.document, async (target) => {
      const statements = planRun(sourceOf(editor), scope, target.engine.dialect.lexical)
      if (statements.length === 0) {
        void vscode.window.showInformationMessage(
          'There is no statement to run here: write one, select it or put the cursor on it.',
        )
        return Promise.resolve(undefined)
      }
      return Promise.resolve(async (parts: RunParts) => {
        this.startRun(parts)
        await this.#runAll(parts, statements)
      })
    })
  }

  async perform(document: vscode.TextDocument, plan: RunPlanner): Promise<void> {
    const target = await this.#target(document)
    const work = target === undefined ? undefined : await plan(target)
    if (target !== undefined && work !== undefined) {
      await this.#withRun(target, work)
    }
  }

  // A new run replaces the tabs of the panel and the errors shown in the editor.
  startRun(parts: RunParts): void {
    parts.panel.startRun(parts.target.engine.dialect)
    this.#dependencies.diagnostics.delete(parts.target.document.uri)
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

  // Shared with EXPLAIN and the server view: a statement into a tab of the editor's panel.
  async runJob(
    parts: RunParts,
    job: Omit<StatementJob, 'tab'> & { readonly tab?: ResultSet },
  ): Promise<boolean> {
    const tab =
      job.tab ??
      new ResultSet({
        id: this.#dependencies.createId(),
        sql: job.sql,
        kind: job.kind,
        canServerView: false,
      })
    if (job.tab === undefined) {
      parts.panel.addTab(tab)
    }
    const outcome = await runStatement(this.#context(parts), { ...job, tab })
    return outcome === 'succeeded'
  }

  dispose(): void {
    this.#changes.dispose()
  }

  async #target(document: vscode.TextDocument): Promise<RunTarget | undefined> {
    const binding = await this.#bindingOf(document)
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
    return { document, connection, engine, scope: bindingScope(binding, engine.dialect) }
  }

  // An editor without a connection asks for one, and keeps it.
  async #bindingOf(document: vscode.TextDocument): Promise<EditorBinding | undefined> {
    const { bindings, pickBinding } = this.#dependencies
    const existing = bindings.get(document.uri)
    if (existing !== undefined) {
      return existing
    }
    const picked = await pickBinding(document)
    if (picked !== undefined) {
      await bindings.set(document.uri, picked)
    }
    return picked
  }

  // One run per editor: a second one waits for the first to end or be cancelled.
  async #withRun(target: RunTarget, work: RunWork): Promise<void> {
    const key = target.document.uri.toString()
    if (this.#runs.has(key)) {
      void vscode.window.showInformationMessage(
        'A query is already running in this editor: cancel it first.',
      )
      return
    }
    const run = new ActiveRun()
    this.#runs.set(key, run)
    this.#changes.fire(target.document.uri)
    try {
      await work(await this.#prepare(target, run))
    } catch (error) {
      void vscode.window.showErrorMessage(`Could not run the query: ${describeError(error)}`)
    } finally {
      this.#runs.delete(key)
      this.#changes.fire(target.document.uri)
    }
  }

  // The connection of the explorer opens too, so that the tree and the autocomplete follow.
  async #prepare(target: RunTarget, run: ActiveRun): Promise<RunParts> {
    const { connect, editorSessions, panels, diagnostics } = this.#dependencies
    await connect(target.connection)
    const session = await editorSessions.acquire(
      target.document.uri.toString(),
      target.connection,
      target.scope,
    )
    const panel = panels.show(target.document.uri)
    panel.startRun(target.engine.dialect)
    diagnostics.delete(target.document.uri)
    return { target, session, panel, run }
  }

  async #runAll(parts: RunParts, statements: readonly PlannedStatement[]): Promise<void> {
    for (const [index, statement] of statements.entries()) {
      const tab = new ResultSet({
        id: this.#dependencies.createId(),
        sql: statement.sql,
        kind: TabKind.Rows,
        canServerView: isReadOnlyQuery(statement.sql, parts.target.engine.dialect.lexical),
      })
      parts.panel.addTab(tab)
      const isDone = await this.runJob(parts, {
        sql: statement.sql,
        values: [],
        place: { offset: statement.offset, prefixLength: 0 },
        isRecorded: true,
        tab,
        kind: TabKind.Rows,
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
      tab.setNotice(`${plural(remaining, 'statement', 'statements')} after this one did not run.`)
      panel.updateTab(tab, true)
    }
  }

  #context(parts: RunParts): StatementContext {
    const { diagnostics, clock, createId, settings } = this.#dependencies
    return {
      document: parts.target.document,
      connectionId: parts.target.connection.id,
      scope: parts.target.scope,
      dialect: parts.target.engine.dialect,
      execute: (sql, request) =>
        parts.session.engineSession.execute({ sql, maxRows: settings().maxRows, ...request }),
      panel: parts.panel,
      diagnostics,
      clock,
      createId,
      record: (entry) => {
        this.#dependencies.record(entry).catch((error: unknown) => {
          this.#dependencies.log.warn(
            `Could not keep the statement in the history: ${describeError(error)}`,
          )
        })
      },
      onExecution: (execution) => {
        parts.run.track(execution)
      },
    }
  }
}

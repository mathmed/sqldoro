import type * as vscode from 'vscode'

import type { ConnectionConfig } from '../../core/connection/connection.ts'
import type { ObjectScope } from '../../core/engine/catalog.ts'
import type { Engine } from '../../core/engine/engine.ts'
import type { Session } from '../../core/session/open-session.ts'
import type { ResultsPanel } from '../results/results-panel.ts'
import type { Approval } from '../safety/approval.ts'
import type { ActiveRun } from './active-run.ts'

// Where an editor runs: its connection, the engine and the database and schema.
export interface RunTarget {
  readonly document: vscode.TextDocument
  readonly connection: ConnectionConfig
  readonly engine: Engine
  readonly scope: ObjectScope
}

export interface RunParts {
  readonly target: RunTarget
  readonly session: Session
  readonly panel: ResultsPanel
  readonly run: ActiveRun
  readonly approval: Approval
}

// What a run does: every statement it may execute, for the guards to check first, and the work.
export interface RunWork {
  readonly statements: readonly string[]
  readonly run: (parts: RunParts) => Promise<void>
}

// Decides what to run once the editor's target is known, or nothing (undefined).
export type RunPlanner = (target: RunTarget) => Promise<RunWork | undefined>

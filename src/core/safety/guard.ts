import {
  type ConnectionConfig,
  EnvironmentTag,
  isEnvironmentTag,
} from '../connection/connection.ts'
import {
  describeStatement,
  isHarmless,
  type StatementClass,
  type UnfilteredWrite,
} from './statement-class.ts'

// The connection a run is about to change.
export interface GuardTarget {
  readonly name: string
  readonly environment: string
  readonly isReadOnly: boolean
}

export interface GuardPolicy {
  // The environment tags treated as production: there, every write asks for a typed confirmation.
  readonly productionEnvironments: ReadonlySet<string>
}

export const Verdict = {
  Allow: 'allow',
  Block: 'block',
  Confirm: 'confirm',
} as const

const ConfirmationKind = {
  UnfilteredWrite: 'unfilteredWrite',
  Production: 'production',
} as const

type ConfirmationKind = (typeof ConfirmationKind)[keyof typeof ConfirmationKind]

// A deliberate act the run waits for: typing a name, once, for this run only.
interface Confirmation {
  readonly kind: ConfirmationKind
  readonly title: string
  readonly prompt: string
  // What must be typed, exactly: the table, or the name of the connection.
  readonly expected: string
  // What the log keeps once it is confirmed: no SQL, no values.
  readonly logLine: string
}

export type GuardDecision =
  | { readonly verdict: typeof Verdict.Allow }
  | { readonly verdict: typeof Verdict.Block; readonly message: string; readonly logLine: string }
  | { readonly verdict: typeof Verdict.Confirm; readonly confirmations: readonly Confirmation[] }

const ALLOW: GuardDecision = { verdict: Verdict.Allow }
const LIST_SEPARATOR = ', '

// The guards, in order: a read-only connection runs nothing that may write; an UPDATE or a DELETE
// that reaches every row waits for its table to be typed; a write on production waits for the name
// of the connection. Statements sqldoro cannot classify count as writes.
export function assessRun(
  statements: readonly StatementClass[],
  target: GuardTarget,
  policy: GuardPolicy,
): GuardDecision {
  const writes = statements.filter((statement) => !isHarmless(statement))
  if (target.isReadOnly && writes.length > 0) {
    return blockReadOnly(writes, target)
  }
  const confirmations = [
    ...statements.flatMap((statement) => statement.unfiltered.map(unfilteredConfirmation)),
    ...productionConfirmations(writes, target, policy),
  ]
  return confirmations.length === 0 ? ALLOW : { verdict: Verdict.Confirm, confirmations }
}

function blockReadOnly(writes: readonly StatementClass[], target: GuardTarget): GuardDecision {
  const verbs = verbsOf(writes)
  const what =
    writes.length === 1
      ? `this ${verbs}`
      : `the script: ${String(writes.length)} of its statements may write (${verbs})`
  return {
    verdict: Verdict.Block,
    message: `"${target.name}" is read-only: sqldoro did not run ${what}. To write, allow writes on the connection first.`,
    logLine: `blocked ${verbs} on "${target.name}": the connection is read-only`,
  }
}

function unfilteredConfirmation(write: UnfilteredWrite): Confirmation {
  const table = write.table === '' ? 'its table' : write.table
  const expected = write.table === '' ? write.verb : write.table
  const effect = write.verb === 'DELETE' ? 'deletes' : 'changes'
  const reason = write.hasAlwaysTrueWhere ? 'its WHERE is always true' : 'it has no WHERE'
  return {
    kind: ConfirmationKind.UnfilteredWrite,
    title: `${write.verb} of every row of ${table}`,
    prompt: `This ${write.verb} ${effect} every row of ${table}: ${reason}. Type ${expected} to run it anyway.`,
    expected,
    logLine: `${write.verb} of every row of ${table} (${reason}) confirmed`,
  }
}

function productionConfirmations(
  writes: readonly StatementClass[],
  target: GuardTarget,
  policy: GuardPolicy,
): Confirmation[] {
  if (writes.length === 0 || !isProduction(target.environment, policy)) {
    return []
  }
  const badge = target.environment.toUpperCase()
  const verbs = verbsOf(writes)
  return [
    {
      kind: ConfirmationKind.Production,
      title: `${badge}: ${target.name}`,
      prompt: `"${target.name}" is tagged ${badge} and this run changes it (${verbs}). Type ${target.name} to run it.`,
      expected: target.name,
      logLine: `${badge} write on "${target.name}" (${verbs}) confirmed`,
    },
  ]
}

function verbsOf(statements: readonly StatementClass[]): string {
  return [...new Set(statements.map(describeStatement))].join(LIST_SEPARATOR)
}

export function isProduction(environment: string, policy: GuardPolicy): boolean {
  return policy.productionEnvironments.has(environment)
}

// The environments the settings treat as production; prod always is.
export function productionEnvironments(configured: readonly unknown[]): ReadonlySet<string> {
  return new Set([EnvironmentTag.Production, ...configured.filter(isEnvironmentTag)])
}

// The confirmation is what was typed, give or take spaces around it.
export function isConfirmed(typed: string, expected: string): boolean {
  return typed.trim() === expected.trim()
}

// Why what is typed does not confirm yet, for the input box; undefined once it does.
export function confirmationProblem(typed: string, expected: string): string | undefined {
  return isConfirmed(typed, expected) ? undefined : `Type ${expected} exactly to confirm`
}

// A connection tagged as production starts read-only: writing there is a deliberate choice made
// after the tag.
export function withEnvironment(
  connection: ConnectionConfig,
  environment: ConnectionConfig['environment'],
  policy: GuardPolicy,
): ConnectionConfig {
  return {
    ...connection,
    environment,
    isReadOnly: connection.isReadOnly || isProduction(environment, policy),
  }
}

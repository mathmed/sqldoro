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
  // The environment tags treated as production: there, every write asks for a confirmation.
  readonly productionEnvironments: ReadonlySet<string>
}

export const Verdict = {
  Allow: 'allow',
  Block: 'block',
  Confirm: 'confirm',
} as const

export const ConfirmationKind = {
  UnfilteredWrite: 'unfilteredWrite',
  Production: 'production',
} as const

type ConfirmationKind = (typeof ConfirmationKind)[keyof typeof ConfirmationKind]

// How a confirmation is given: a button of a modal dialog, or typing a name for the riskiest
// statements (an UPDATE or a DELETE of every row on production).
export const ConfirmationStyle = {
  Button: 'button',
  Typed: 'typed',
} as const

interface ConfirmationParts {
  readonly kind: ConfirmationKind
  // What the run does that needs it, and why: a line of the dialog.
  readonly reason: string
  // The button that confirms it.
  readonly button: string
  // What the log keeps once it is confirmed: no SQL, no values.
  readonly logLine: string
}

// What must be typed, exactly (the table, or the verb when the table is not known), with the title
// and the prompt of the input box that asks for it.
export interface TypedPart {
  readonly title: string
  readonly prompt: string
  readonly expected: string
}

// A deliberate act the run waits for, once, for this run only.
export type Confirmation =
  | (ConfirmationParts & { readonly style: typeof ConfirmationStyle.Button })
  | (ConfirmationParts & TypedPart & { readonly style: typeof ConfirmationStyle.Typed })

export type GuardDecision =
  | { readonly verdict: typeof Verdict.Allow }
  | { readonly verdict: typeof Verdict.Block; readonly message: string; readonly logLine: string }
  | { readonly verdict: typeof Verdict.Confirm; readonly confirmations: readonly Confirmation[] }

const ALLOW: GuardDecision = { verdict: Verdict.Allow }
const LIST_SEPARATOR = ', '

// The guards, in order: a read-only connection runs nothing that may write; an UPDATE or a DELETE
// that reaches every row waits for a button, or for its table to be typed on production; any other
// write on production waits for a button. Statements sqldoro cannot classify count as writes.
export function assessRun(
  statements: readonly StatementClass[],
  target: GuardTarget,
  policy: GuardPolicy,
): GuardDecision {
  const writes = statements.filter((statement) => !isHarmless(statement))
  if (target.isReadOnly && writes.length > 0) {
    return blockReadOnly(writes, target)
  }
  const isOnProduction = isProduction(target.environment, policy)
  const confirmations = [
    ...statements.flatMap((statement) =>
      statement.unfiltered.map((write) => unfilteredConfirmation(write, target, isOnProduction)),
    ),
    ...(isOnProduction ? productionConfirmations(writes, target) : []),
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

// On production, the table of an UPDATE or a DELETE of every row is typed; elsewhere a button does.
function unfilteredConfirmation(
  write: UnfilteredWrite,
  target: GuardTarget,
  isOnProduction: boolean,
): Confirmation {
  const { table, effect, why } = unfilteredWords(write)
  const parts = {
    kind: ConfirmationKind.UnfilteredWrite,
    reason: `This ${write.verb} ${effect} every row of ${table}: ${why}.`,
    button: `Run the ${write.verb} of Every Row`,
    logLine: `${write.verb} of every row of ${table} (${why}) confirmed`,
  }
  return isOnProduction
    ? { ...parts, style: ConfirmationStyle.Typed, ...typedPart(write, connectionLabel(target)) }
    : { ...parts, style: ConfirmationStyle.Button }
}

interface UnfilteredWords {
  readonly table: string
  readonly effect: string
  readonly why: string
}

function unfilteredWords(write: UnfilteredWrite): UnfilteredWords {
  return {
    table: write.table === '' ? 'its table' : write.table,
    effect: write.verb === 'DELETE' ? 'deletes' : 'changes',
    why: write.hasAlwaysTrueWhere ? 'its WHERE is always true' : 'it has no WHERE',
  }
}

// The table is typed, or the verb when the table is not known.
function typedPart(write: UnfilteredWrite, connection: string): TypedPart {
  const { table, effect, why } = unfilteredWords(write)
  const expected = write.table === '' ? write.verb : write.table
  return {
    title: `${write.verb} of every row of ${table} on ${connection}`,
    prompt: `This ${write.verb} ${effect} every row of ${table} on ${connection}: ${why}. Type ${expected} to run it anyway.`,
    expected,
  }
}

function productionConfirmations(
  writes: readonly StatementClass[],
  target: GuardTarget,
): Confirmation[] {
  if (writes.length === 0) {
    return []
  }
  const badge = target.environment.toUpperCase()
  const verbs = verbsOf(writes)
  return [
    {
      kind: ConfirmationKind.Production,
      style: ConfirmationStyle.Button,
      reason: `"${target.name}" is tagged ${badge} and this run changes it (${verbs}).`,
      button: `Run on ${target.name}`,
      logLine: `${badge} write on "${target.name}" (${verbs}) confirmed`,
    },
  ]
}

// "Shop" (PROD), or "Shop" when the connection has no environment.
export function connectionLabel(target: Pick<GuardTarget, 'environment' | 'name'>): string {
  const name = `"${target.name}"`
  return target.environment === EnvironmentTag.None
    ? name
    : `${name} (${target.environment.toUpperCase()})`
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

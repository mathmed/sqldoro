import type { Contract, Setting } from './manifest.ts'

export const Severity = {
  Breaking: 'breaking',
  Added: 'added',
} as const

export type Severity = (typeof Severity)[keyof typeof Severity]

export interface ContractChange {
  readonly severity: Severity
  readonly item: string
  readonly detail: string
}

// A removed or renamed command, view, view container or setting breaks what relied on it, and so
// does a setting whose type changed or that no longer allows a value; what is new only adds.
export function contractChanges(base: Contract, head: Contract): ContractChange[] {
  return [
    ...idChanges('command', base.commands, head.commands),
    ...idChanges('view', base.views, head.views),
    ...idChanges('view container', base.viewContainers, head.viewContainers),
    ...idChanges('setting', new Set(base.settings.keys()), new Set(head.settings.keys())),
    ...[...base.settings].flatMap(([key, setting]) => settingChanges(key, setting, head.settings)),
  ]
}

function idChanges(
  kind: string,
  base: ReadonlySet<string>,
  head: ReadonlySet<string>,
): ContractChange[] {
  return [
    ...[...base]
      .filter((id) => !head.has(id))
      .map((id) => ({ severity: Severity.Breaking, item: itemOf(kind, id), detail: 'removed' })),
    ...[...head]
      .filter((id) => !base.has(id))
      .map((id) => ({ severity: Severity.Added, item: itemOf(kind, id), detail: 'added' })),
  ]
}

function settingChanges(
  key: string,
  base: Setting,
  settings: ReadonlyMap<string, Setting>,
): ContractChange[] {
  const head = settings.get(key)
  const problem = head === undefined ? undefined : settingProblem(base, head)
  return problem === undefined
    ? []
    : [{ severity: Severity.Breaking, item: itemOf('setting', key), detail: problem }]
}

function settingProblem(base: Setting, head: Setting): string | undefined {
  if (head.type !== base.type) {
    return `type ${base.type} → ${head.type}`
  }
  if (head.values.length === 0) {
    return undefined
  }
  if (base.values.length === 0) {
    return `now only allows ${head.values.join(', ')}`
  }
  const removed = base.values.filter((value) => !head.values.includes(value))
  return removed.length === 0 ? undefined : `no longer allows ${removed.join(', ')}`
}

function itemOf(kind: string, id: string): string {
  return `${kind} \`${id}\``
}

import type { ObjectRef } from '../engine/catalog.ts'
import { IDENTITY_VIEW, type ViewSpec } from '../results/view.ts'
import { type KeyMatch, keyText } from './keys.ts'
import { tableLabel } from './links.ts'

// A table as one step of a navigation shows it: its rows, or those a key leads to, with the WHERE
// and the view the user gave them there. Going back to a step reads its rows again as they were
// shown.
export interface TableStep {
  // Stable for the life of the navigation: what the view keeps the scroll position of a step by.
  readonly id: number
  readonly table: ObjectRef
  readonly key: KeyMatch | undefined
  readonly condition: string
  readonly view: ViewSpec
  // The names of the columns the positions of the view refer to; empty before the rows are read.
  readonly columns: readonly string[]
  // The row the navigation left the step from, as people read it ("#1"); empty when not known.
  readonly departure: string
  // The statement the user ran from the query box of the panel, which the step shows the result
  // of in place of the rows of its table; empty for the rows of the table.
  readonly query: string
}

export interface Navigation {
  readonly steps: readonly TableStep[]
  // The step shown.
  readonly index: number
  readonly nextId: number
}

// A place of a navigation, as the trail above the rows shows it.
export interface Crumb {
  readonly id: number
  readonly label: string
  readonly isCurrent: boolean
  // The step of a query run from the query box, not the rows of a table.
  readonly isQuery: boolean
}

export type StepStart = Pick<TableStep, 'key' | 'table'>

// Old steps go once the trail is this long: going back that far is the work of the explorer.
export const MAX_STEPS = 30
// How the trail names the step of a query run from the query box.
const QUERY_LABEL = 'Query'

function newStep(start: StepStart, id: number): TableStep {
  return { ...start, id, condition: '', view: IDENTITY_VIEW, columns: [], departure: '', query: '' }
}

export function startNavigation(start: StepStart): Navigation {
  return { steps: [newStep(start, 0)], index: 0, nextId: 1 }
}

// A new step after the one shown: the steps forward of it go, as in a browser. A navigation that
// goes on from another panel starts from its trail the same way.
export function pushStep(navigation: Navigation, start: StepStart): Navigation {
  const kept = navigation.steps.slice(0, navigation.index + 1)
  const steps = [...kept, newStep(start, navigation.nextId)].slice(-MAX_STEPS)
  return { steps, index: steps.length - 1, nextId: navigation.nextId + 1 }
}

export function currentStep(navigation: Navigation): TableStep {
  return stepAt(navigation, navigation.index)
}

function stepAt(navigation: Navigation, index: number): TableStep {
  const step = navigation.steps.at(index)
  if (step === undefined) {
    throw new RangeError(`The navigation has no step ${String(index)}`)
  }
  return step
}

// What the user did on the step shown: its WHERE, its view, the row left from, its query.
export function withCurrent(
  navigation: Navigation,
  change: Partial<Pick<TableStep, 'columns' | 'condition' | 'departure' | 'query' | 'view'>>,
): Navigation {
  return {
    ...navigation,
    steps: navigation.steps.map((step, index) =>
      index === navigation.index ? { ...step, ...change } : step,
    ),
  }
}

export function isQueryStep(step: Pick<TableStep, 'query'>): boolean {
  return step.query !== ''
}

// A query run from the query box: a step of its own after the step shown, on the same table, so
// that Back returns to the rows it was run from. A query run from the step of a query takes its
// place: the trail keeps one step per query box session, not one per run.
export function withQuery(navigation: Navigation, query: string): Navigation {
  const current = currentStep(navigation)
  const moved = isQueryStep(current)
    ? navigation
    : pushStep(navigation, { table: current.table, key: undefined })
  return withCurrent(moved, { query, departure: '' })
}

// The step `offset` steps away (-1 back, 1 forward); undefined past either end.
export function moveBy(navigation: Navigation, offset: number): Navigation | undefined {
  return moveTo(navigation, navigation.index + offset)
}

// The step with this id; undefined when it is not in the trail, or already shown.
export function moveToStep(navigation: Navigation, id: number): Navigation | undefined {
  const index = navigation.steps.findIndex((step) => step.id === id)
  return index === navigation.index ? undefined : moveTo(navigation, index)
}

function moveTo(navigation: Navigation, index: number): Navigation | undefined {
  return index >= 0 && index < navigation.steps.length ? { ...navigation, index } : undefined
}

export function canMoveBy(navigation: Navigation, offset: number): boolean {
  return moveBy(navigation, offset) !== undefined
}

// "Condominium #1 → CondominiumBankAccount (condominiumId = 1)": each step by its table, and the row
// it shows or was left from. A table of another schema than the first step's names its schema.
export function crumbsOf(navigation: Navigation): Crumb[] {
  const home = stepAt(navigation, 0).table
  return navigation.steps.map((step, index) => ({
    id: step.id,
    label: stepLabel(step, home),
    isCurrent: index === navigation.index,
    isQuery: isQueryStep(step),
  }))
}

// The step of a query is named as such: its text is in the query box.
export function stepLabel(step: TableStep, home: ObjectRef): string {
  const name = isQueryStep(step) ? QUERY_LABEL : tableLabel(step.table, home)
  const detail = step.key === undefined ? step.departure : keyText(step.key)
  return [name, detail].filter((part) => part !== '').join(' ')
}

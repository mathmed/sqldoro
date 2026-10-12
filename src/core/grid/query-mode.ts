import type { Crumb } from '../navigation/history.ts'
import type { QueryBoxText } from '../results/protocol-parts.ts'
import { MAX_QUERY_HEIGHT } from '../results/protocol.ts'

// Whether a table panel shows its query box above the rows (query mode) or the WHERE of its table,
// and what the user wrote in the box. The box opens on the statement of the rows shown; what the
// user writes is kept for the step it was written from, so that closing the box and opening it
// again finds it.
export interface QueryMode {
  // The user opened the box (the expand button, Ctrl+Shift+E).
  readonly isOpen: boolean
  // The result of a query the box was closed on: it stays closed while that result is on screen.
  readonly closedOn: string | null
  // What the user wrote, by the id of the step of the trail it was written from.
  readonly drafts: ReadonlyMap<number, string>
}

export const WHERE_MODE: QueryMode = { isOpen: false, closedOn: null, drafts: new Map() }

// The tab on screen, as the box sees it.
export interface BoxTab {
  readonly id: string
  readonly queryBox: QueryBoxText | null
}

// Where the box is: the tab on screen (none before the first) and the trail of the panel.
export interface BoxPlace {
  readonly tab: BoxTab | undefined
  readonly crumbs: readonly Crumb[]
}

// What toggling the box does: the mode after it, and the step of the trail to show again (the
// rows a query was run from, when the box closes on its result), or null.
export interface Toggle {
  readonly mode: QueryMode
  readonly goTo: number | null
}

// Where the trail is not known yet.
const NO_STEP = -1

// Only the tabs of table panels have a query box.
export function hasBox(tab: BoxTab | undefined): boolean {
  return (tab?.queryBox ?? null) !== null
}

function isCustom(tab: BoxTab | undefined): boolean {
  return tab?.queryBox?.isCustom === true
}

// The box shows when the user opened it, and always with the result of a query of the box, unless
// the user closed it on that result.
export function isBoxShown(mode: QueryMode, tab: BoxTab | undefined): boolean {
  if (tab === undefined || !hasBox(tab)) {
    return false
  }
  return mode.isOpen || (isCustom(tab) && tab.id !== mode.closedOn)
}

// Opening shows the box; closing it on the result of a query goes back to the rows the query was
// run from, which the WHERE of their table filters again.
export function toggleBox(mode: QueryMode, place: BoxPlace): Toggle {
  if (!hasBox(place.tab)) {
    return { mode, goTo: null }
  }
  if (!isBoxShown(mode, place.tab)) {
    return { mode: { ...mode, isOpen: true, closedOn: null }, goTo: null }
  }
  return closeBox(mode, place)
}

function closeBox(mode: QueryMode, { tab, crumbs }: BoxPlace): Toggle {
  const closed = { ...mode, isOpen: false, closedOn: null }
  if (tab === undefined || !isCustom(tab)) {
    return { mode: closed, goTo: null }
  }
  return { mode: { ...closed, closedOn: tab.id }, goTo: previousStep(crumbs) }
}

function currentIndex(crumbs: readonly Crumb[]): number {
  return crumbs.findIndex((crumb) => crumb.isCurrent)
}

// The step before the one shown, if any.
function previousStep(crumbs: readonly Crumb[]): number | null {
  const index = currentIndex(crumbs)
  const previous = index > 0 ? crumbs.at(index - 1) : undefined
  return previous?.id ?? null
}

// The step the text of the box is written from: the step shown, or for the step of a query the step
// it was run from (the one before it). The trail says, not the tab on screen: while a query runs,
// the trail shows its step and the screen still the rows it was run from.
export function originStep({ crumbs }: BoxPlace): number {
  const shown = crumbs.find((crumb) => crumb.isCurrent)
  if (shown === undefined) {
    return NO_STEP
  }
  return (shown.isQuery ? previousStep(crumbs) : null) ?? shown.id
}

// What the box holds: what the user wrote from this step, or the statement of the tab shown.
export function boxText(mode: QueryMode, place: BoxPlace): string {
  return mode.drafts.get(originStep(place)) ?? place.tab?.queryBox?.sql ?? ''
}

// The text the user wrote, kept for the step it is written from; the statement of the tab itself
// is not kept, so that the box follows it as the rows are read again.
export function withDraft(mode: QueryMode, place: BoxPlace, text: string): QueryMode {
  const drafts = new Map(mode.drafts)
  const origin = originStep(place)
  if (text === place.tab?.queryBox?.sql) {
    drafts.delete(origin)
  } else {
    drafts.set(origin, text)
  }
  return { ...mode, drafts }
}

// Back to the statement of the tab shown: what was written from its step goes.
export function withoutDraft(mode: QueryMode, place: BoxPlace): QueryMode {
  const drafts = new Map(mode.drafts)
  drafts.delete(originStep(place))
  return { ...mode, drafts }
}

// The text of the box, line by line, in pixels: the stylesheet of the box uses the same.
export const BOX_LINE_HEIGHT = 18
// Above and below the text of the box, together.
export const BOX_PADDING = 8
const MIN_LINES = 2
const DEFAULT_LINES = 8
// The box takes at most this share of the height of the panel.
const MAX_SHARE = 0.5

function linesHeight(lines: number): number {
  return lines * BOX_LINE_HEIGHT + BOX_PADDING
}

export const MIN_BOX_HEIGHT = linesHeight(MIN_LINES)

// How tall the text of the box may grow: the height the user chose by dragging its edge (or 8
// lines), from 2 lines to half the panel.
export function boxCap(chosen: number | null, panelHeight: number): number {
  const max = Math.max(MIN_BOX_HEIGHT, Math.floor(panelHeight * MAX_SHARE))
  return Math.min(Math.max(chosen ?? linesHeight(DEFAULT_LINES), MIN_BOX_HEIGHT), max)
}

// As tall as its text, from 2 lines up to the cap: longer text scrolls.
export function boxHeight(text: string, cap: number): number {
  const lines = text.split('\n').length
  return Math.min(Math.max(linesHeight(lines), MIN_BOX_HEIGHT), cap)
}

// A height kept in the state of the workspace, if it is one the box can take.
export function storedHeight(value: unknown): number | null {
  return Number.isInteger(value) && Number(value) >= 0 && Number(value) <= MAX_QUERY_HEIGHT
    ? Number(value)
    : null
}

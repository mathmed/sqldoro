import * as vscode from 'vscode'

import type { Row } from '../../core/engine/query.ts'
import {
  moveToStep,
  type Navigation,
  pushStep,
  startNavigation,
  type StepStart,
  withCurrent,
} from '../../core/navigation/history.ts'
import { linkAt, linkKey, referenceKey } from '../../core/navigation/links.ts'
import type { NavigationStart } from '../../core/results/protocol.ts'
import { rowLabel } from '../../core/results/result-meta.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { TableContext } from '../tables/table-context.ts'
import { showStep } from '../tables/table-data.ts'
import { tableUri } from '../tables/table-uri.ts'

// What a navigation works with beside the table panels: the connection a source (an editor or a
// table panel) runs on.
export interface NavigationContext extends TableContext {
  readonly connectionOf: (source: vscode.Uri) => string | undefined
}

// Where a navigation goes from a row: the rows it leads to.
interface Leading {
  readonly tab: ResultSet
  readonly row: Row
  readonly next: StepStart
  readonly isInPlace: boolean
}

const NULL_LINK = 'This cell points at no row: it is NULL.'
const NULL_KEY = 'This row holds no value for the columns the references point at.'

// The row the foreign key of a cell points at: in a panel of its own, or in place in a table panel,
// which keeps the trail to go back. A NULL points nowhere.
export async function openLink(
  context: NavigationContext,
  source: vscode.Uri,
  {
    tab,
    start,
    column,
  }: { readonly tab: ResultSet; readonly start: NavigationStart; readonly column: number },
): Promise<void> {
  const link = linkAt(tab.meta.links, column)
  const row = tab.viewRow(start.row)
  if (link === undefined || row === undefined) {
    return
  }
  const key = linkKey(link, row)
  if (key === undefined) {
    void vscode.window.showInformationMessage(NULL_LINK)
    return
  }
  const next = { table: link.foreignKey.target, key }
  await openRows(context, source, { tab, row, next, isInPlace: start.isInPlace })
}

// The rows of another table whose foreign key holds the values of a row of this one.
export async function openReference(
  context: NavigationContext,
  source: vscode.Uri,
  {
    tab,
    start,
    reference,
  }: { readonly tab: ResultSet; readonly start: NavigationStart; readonly reference: number },
): Promise<void> {
  const referencing = tab.meta.references.at(reference)
  const row = tab.viewRow(start.row)
  if (referencing === undefined || row === undefined) {
    return
  }
  const key = referenceKey(referencing, row)
  if (key === undefined) {
    void vscode.window.showInformationMessage(NULL_KEY)
    return
  }
  const next = { table: referencing.reference.table, key }
  await openRows(context, source, { tab, row, next, isInPlace: start.isInPlace })
}

// A step of the trail of a table panel again, read anew in the view it had.
export async function goToStep(
  context: NavigationContext,
  source: vscode.Uri,
  step: number,
): Promise<void> {
  const navigation = context.navigations.get(source)
  const moved = navigation === undefined ? undefined : moveToStep(navigation, step)
  if (moved !== undefined && (await context.runner.confirmDropChanges(source))) {
    context.navigations.set(source, moved)
    await showStep(context, source)
  }
}

async function openRows(
  context: NavigationContext,
  source: vscode.Uri,
  leading: Leading,
): Promise<void> {
  const connectionId = context.connectionOf(source)
  if (connectionId === undefined) {
    return
  }
  const departed = departedTrail(context, source, leading)
  if (leading.isInPlace && departed !== undefined) {
    await openInPlace(context, source, pushStep(departed, leading.next))
    return
  }
  const navigation =
    departed === undefined ? startNavigation(leading.next) : pushStep(departed, leading.next)
  await openInPanel(context, connectionId, { navigation, next: leading.next })
}

// The trail of a table panel, with the row the navigation leaves from; editors have none.
function departedTrail(
  context: NavigationContext,
  source: vscode.Uri,
  { tab, row }: Leading,
): Navigation | undefined {
  const trail = context.navigations.get(source)
  return trail === undefined
    ? undefined
    : withCurrent(trail, { departure: rowLabel(tab.meta, row) })
}

async function openInPlace(
  context: NavigationContext,
  source: vscode.Uri,
  navigation: Navigation,
): Promise<void> {
  if (await context.runner.confirmDropChanges(source)) {
    context.navigations.set(source, navigation)
    await showStep(context, source)
  }
}

// A panel that shows these rows already is shown again: a second click opens nothing more.
async function openInPanel(
  context: NavigationContext,
  connectionId: string,
  { navigation, next }: { readonly navigation: Navigation; readonly next: StepStart },
): Promise<void> {
  const showing = context.navigations.showing(connectionId, next)
  if (showing !== undefined) {
    context.panels.get(showing)?.reveal()
    return
  }
  const uri = tableUri({ connectionId, table: next.table, instance: context.createId() })
  context.navigations.set(uri, navigation)
  await showStep(context, uri)
}

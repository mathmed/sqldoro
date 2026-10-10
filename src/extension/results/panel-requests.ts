import type { Dialect } from '../../core/engine/dialect.ts'
import type { Logger } from '../../core/platform.ts'
import {
  type HostMessage,
  HostMessageType,
  type WebviewMessage,
  WebviewMessageType,
} from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { PanelActions } from './panel-actions.ts'

// What the messages of a result view act on: the tabs of its panel, what the panel tells the view,
// and what it cannot do on its own.
export interface PanelRequests {
  readonly actions: PanelActions
  readonly log: Logger
  readonly tab: (tabId: string) => ResultSet | undefined
  // The dialect of the last run, unknown before the first one.
  readonly dialect: () => Dialect | undefined
  readonly post: (message: HostMessage) => void
  // Tells the view that a tab changed.
  readonly update: (tab: ResultSet) => void
  // The view (re)loaded: it gets the tabs of the run again.
  readonly ready: () => void
}

type MessageOf<T extends WebviewMessage['type']> = Extract<WebviewMessage, { readonly type: T }>
type Handle<T extends WebviewMessage['type']> = (
  requests: PanelRequests,
  message: MessageOf<T>,
) => Promise<void>
type Route = (requests: PanelRequests, message: WebviewMessage) => Promise<void>

// Long text is cut in the grid; the cell detail asks for the rest.
const MAX_CELL_PREVIEW = 1000
const KEEP_CHANGES =
  'Apply or revert the changes first: running the query again would read the rows again and drop them.'

// Each handler gets the message of its own type: the map routes by type, so the narrowing is done
// once, here.
function route<T extends WebviewMessage['type']>(
  type: T,
  handle: Handle<T>,
): readonly [string, Route] {
  return [type, async (requests, message) => handle(requests, message as MessageOf<T>)]
}

// A handler that is done at once.
function atOnce<T extends WebviewMessage['type']>(
  handle: (requests: PanelRequests, message: MessageOf<T>) => void,
): Handle<T> {
  return async (requests, message) => {
    handle(requests, message)
    return Promise.resolve()
  }
}

// The tab a message names, if the view it was made on is still the tab's.
function current(
  requests: PanelRequests,
  tabId: string,
  viewVersion: number,
): ResultSet | undefined {
  const tab = requests.tab(tabId)
  return tab?.viewVersion === viewVersion ? tab : undefined
}

// Only the tabs made to be read again are: the rows of a table opened from the explorer.
function tableTab(requests: PanelRequests, tabId: string): ResultSet | undefined {
  const tab = requests.tab(tabId)
  return tab?.canRefresh === true ? tab : undefined
}

// Reading the rows of a tab again would drop its changes: the user applies or reverts them first.
// A tab whose rows are being read is left alone.
async function readAgain(
  requests: PanelRequests,
  tab: ResultSet | undefined,
  read: (tab: ResultSet) => Promise<void>,
): Promise<void> {
  if (tab === undefined || tab.isRunning) {
    return
  }
  if (!tab.editor.hasChanges) {
    await read(tab)
    return
  }
  tab.editor.notify(KEEP_CHANGES, true)
  requests.update(tab)
}

// The rows of a tab that ran are sorted, filtered or searched here, at once.
function reshow(requests: PanelRequests, tabId: string, change: (tab: ResultSet) => void): void {
  const tab = requests.tab(tabId)
  if (tab !== undefined && !tab.isRunning) {
    change(tab)
    requests.update(tab)
  }
}

const sendRows: Handle<typeof WebviewMessageType.FetchRows> = atOnce((requests, message) => {
  const { tabId, viewVersion, start, count } = message
  const rows = current(requests, tabId, viewVersion)?.window(start, count, MAX_CELL_PREVIEW)
  if (rows !== undefined) {
    requests.post({ type: HostMessageType.Rows, tabId, viewVersion, start, rows })
  }
})

const sendCell: Handle<typeof WebviewMessageType.FetchCell> = atOnce((requests, message) => {
  const { tabId, viewVersion, row, column } = message
  const tab = current(requests, tabId, viewVersion)
  if (tab !== undefined) {
    const value = tab.cell(row, column)
    requests.post({ type: HostMessageType.Cell, tabId, viewVersion, row, column, value })
  }
})

// The rows already here are sorted and filtered at once; the server view runs the query again.
const setView: Handle<typeof WebviewMessageType.SetView> = async (requests, message) => {
  const { tabId, view } = message
  if (message.isServerSide) {
    await readAgain(requests, requests.tab(tabId), async (tab) =>
      requests.actions.serverView(tab, view),
    )
    return
  }
  reshow(requests, tabId, (tab) => {
    tab.applyView(view)
  })
}

const copy: Handle<typeof WebviewMessageType.Copy> = async (requests, message) => {
  const tab = current(requests, message.tabId, message.viewVersion)
  const dialect = requests.dialect()
  if (tab !== undefined && dialect !== undefined) {
    await requests.actions.copy(tab, { range: message.range, format: message.format }, dialect)
  }
}

const exportRows: Handle<typeof WebviewMessageType.Export> = async (requests, message) => {
  const tab = requests.tab(message.tabId)
  const dialect = requests.dialect()
  if (tab !== undefined && dialect !== undefined) {
    await requests.actions.export(tab, message.format, dialect)
  }
}

const copyColumnName: Handle<typeof WebviewMessageType.CopyColumnName> = async (
  requests,
  message,
) => {
  const tab = requests.tab(message.tabId)
  if (tab !== undefined) {
    await requests.actions.copyColumnName(tab, message.column)
  }
}

// An edit names the view it was made on: made on another one, it is dropped.
const edit: Handle<typeof WebviewMessageType.Edit> = atOnce((requests, message) => {
  const tab = current(requests, message.tabId, message.viewVersion)
  if (tab?.editor.act(message.edit, tab) !== true) {
    requests.log.debug('An edit of a result that changed since, or cannot be edited, was dropped')
    return
  }
  requests.update(tab)
})

const previewEdits: Handle<typeof WebviewMessageType.PreviewEdits> = atOnce((requests, message) => {
  const tab = requests.tab(message.tabId)
  const dialect = requests.dialect()
  if (tab !== undefined && dialect !== undefined) {
    const setting = { dialect, isInOpenTransaction: requests.actions.isInOpenTransaction() }
    tab.editor.preview(tab, setting)
    requests.update(tab)
  }
})

const closePreview: Handle<typeof WebviewMessageType.ClosePreview> = atOnce((requests, message) => {
  const tab = requests.tab(message.tabId)
  if (tab !== undefined) {
    tab.editor.closePreview()
    requests.update(tab)
  }
})

// The preview the user confirmed applies once: a click again, or an older preview, does nothing.
const applyEdits: Handle<typeof WebviewMessageType.ApplyEdits> = async (requests, message) => {
  const tab = requests.tab(message.tabId)
  const plan = tab?.editor.take(message.previewId)
  if (tab === undefined || plan === undefined) {
    requests.log.debug('An apply of a preview that is gone was dropped')
    return
  }
  requests.update(tab)
  await requests.actions.applyEdits(tab, plan)
  requests.update(tab)
}

const ROUTES: ReadonlyMap<string, Route> = new Map([
  route(
    WebviewMessageType.Ready,
    atOnce((requests) => {
      requests.ready()
    }),
  ),
  route(WebviewMessageType.FetchRows, sendRows),
  route(WebviewMessageType.FetchCell, sendCell),
  route(WebviewMessageType.SetView, setView),
  route(
    WebviewMessageType.Search,
    atOnce((requests, { tabId, text }) => {
      reshow(requests, tabId, (tab) => {
        tab.searchFor(text)
      })
    }),
  ),
  route(WebviewMessageType.Copy, copy),
  route(WebviewMessageType.Export, exportRows),
  route(WebviewMessageType.CopyColumnName, copyColumnName),
  route(
    WebviewMessageType.Cancel,
    atOnce((requests) => {
      requests.actions.cancel()
    }),
  ),
  route(WebviewMessageType.LoadAll, async (requests, { tabId }) =>
    readAgain(requests, requests.tab(tabId), requests.actions.loadAll),
  ),
  route(WebviewMessageType.Refresh, async (requests, { tabId }) =>
    readAgain(requests, tableTab(requests, tabId), requests.actions.refresh),
  ),
  route(WebviewMessageType.FilterTable, async (requests, { tabId, condition }) =>
    readAgain(requests, tableTab(requests, tabId), async (tab) =>
      requests.actions.filterTable(tab, condition),
    ),
  ),
  route(
    WebviewMessageType.Problem,
    atOnce((requests, message) => {
      requests.log.warn(`The result view had a problem: ${message.message}`)
    }),
  ),
  route(WebviewMessageType.Edit, edit),
  route(WebviewMessageType.PreviewEdits, previewEdits),
  route(WebviewMessageType.ClosePreview, closePreview),
  route(WebviewMessageType.ApplyEdits, applyEdits),
])

// Does what a message of the view asks, once the parser has checked it.
export async function handleRequest(
  requests: PanelRequests,
  message: WebviewMessage,
): Promise<void> {
  await ROUTES.get(message.type)?.(requests, message)
}

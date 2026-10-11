import {
  HostMessageType,
  MAX_DISTINCT_VALUES,
  type WebviewMessage,
  WebviewMessageType,
} from '../../core/results/protocol.ts'
import type { ResultSet } from '../../core/results/result-set.ts'
import type { PanelRequests } from './panel-request-context.ts'

type MessageOf<T extends WebviewMessage['type']> = Extract<WebviewMessage, { readonly type: T }>
type Route = (requests: PanelRequests, message: WebviewMessage) => Promise<void>

function route<T extends WebviewMessage['type']>(
  type: T,
  handle: (requests: PanelRequests, message: MessageOf<T>) => Promise<void>,
): readonly [string, Route] {
  return [type, async (requests, message) => handle(requests, message as MessageOf<T>)]
}

// The tab a message names, if the view it was made on is still the tab's: a navigation from a row
// of another view would leave from another row.
function current(
  requests: PanelRequests,
  tabId: string,
  viewVersion: number,
): ResultSet | undefined {
  const tab = requests.tab(tabId)
  return tab?.viewVersion === viewVersion ? tab : undefined
}

const setLayout = route(WebviewMessageType.SetLayout, async (requests, message) => {
  const tab = requests.tab(message.tabId)
  if (tab !== undefined) {
    tab.setLayout(message.layout)
    requests.update(tab)
    await requests.actions.saveLayout(tab)
  }
})

const navigate = route(WebviewMessageType.Navigate, async (requests, message) => {
  const tab = current(requests, message.tabId, message.viewVersion)
  if (tab !== undefined) {
    await requests.actions.navigate(tab, { start: message, column: message.column })
  }
})

const openReference = route(WebviewMessageType.OpenReference, async (requests, message) => {
  const tab = current(requests, message.tabId, message.viewVersion)
  if (tab !== undefined) {
    await requests.actions.openReference(tab, { start: message, reference: message.reference })
  }
})

const countReferences = route(WebviewMessageType.CountReferences, async (requests, message) => {
  const { tabId, viewVersion, row } = message
  const tab = current(requests, tabId, viewVersion)
  const counts = tab === undefined ? undefined : await requests.actions.countReferences(tab, row)
  if (counts !== undefined) {
    requests.post({ type: HostMessageType.ReferenceCounts, tabId, viewVersion, row, counts })
  }
})

const peek = route(WebviewMessageType.Peek, async (requests, message) => {
  const { tabId, viewVersion, row, column } = message
  const tab = current(requests, tabId, viewVersion)
  if (tab !== undefined) {
    const view = await requests.actions.peek(tab, { row, column })
    requests.post({ type: HostMessageType.Peek, tabId, viewVersion, row, column, peek: view })
  }
})

// The values a column holds in the rows fetched, at once.
const fetchDistinct = route(WebviewMessageType.FetchDistinct, async (requests, message) => {
  const tab = requests.tab(message.tabId)
  if (tab !== undefined) {
    const { values, isComplete } = tab.distinct(message.column, MAX_DISTINCT_VALUES)
    const { tabId, column } = message
    requests.post({ type: HostMessageType.Distinct, tabId, column, values, isComplete })
  }
  return Promise.resolve()
})

const openInEditor = route(WebviewMessageType.OpenInEditor, async (requests, message) => {
  const tab = requests.tab(message.tabId)
  if (tab?.canRefresh === true) {
    await requests.actions.openInEditor(tab)
  }
})

// The routes of the messages that navigate between rows and tables, lay the columns out and ask
// the extension for what only it can do.
export const NAVIGATION_ROUTES: readonly (readonly [string, Route])[] = [
  setLayout,
  navigate,
  openReference,
  countReferences,
  peek,
  fetchDistinct,
  openInEditor,
  route(WebviewMessageType.GoToStep, async (requests, message) =>
    requests.actions.goToStep(message.step),
  ),
  route(WebviewMessageType.AllowWrites, async (requests) => requests.actions.allowWrites()),
]

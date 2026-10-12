import { parseSearchHostMessage } from '../../core/table-search/parse-host-message.ts'
import {
  type SearchHostMessage,
  type SearchViewMessage,
  SearchViewMessageType,
} from '../../core/table-search/protocol.ts'
import type { HostChannel, VsCodeApi } from '../host.ts'

// The API of the search box: it posts the messages of the table search protocol.
export type SearchApi = VsCodeApi<SearchViewMessage>

export const SEARCH_CHANNEL: HostChannel<SearchHostMessage, SearchViewMessage> = {
  parse: parseSearchHostMessage,
  problem: (message) => ({
    type: SearchViewMessageType.Problem,
    message: `The table search received a message it cannot read: ${message}`,
  }),
}

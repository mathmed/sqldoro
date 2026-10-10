import { parseHostMessage } from '../core/results/parse-host-message.ts'
import {
  type HostMessage,
  type WebviewMessage,
  WebviewMessageType,
} from '../core/results/protocol.ts'
import type { HostChannel, VsCodeApi } from './host.ts'

// The API of the result view: it posts the messages of the result protocol.
export type ResultsApi = VsCodeApi<WebviewMessage>

export const RESULTS_CHANNEL: HostChannel<HostMessage, WebviewMessage> = {
  parse: parseHostMessage,
  problem: (message) => ({
    type: WebviewMessageType.Problem,
    message: `The result view received a message it cannot read: ${message}`,
  }),
}

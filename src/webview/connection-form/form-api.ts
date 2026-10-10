import { parseFormHostMessage } from '../../core/connection-form/parse-host-message.ts'
import {
  type FormHostMessage,
  type FormViewMessage,
  FormViewMessageType,
} from '../../core/connection-form/protocol.ts'
import type { HostChannel, VsCodeApi } from '../host.ts'

// The API of the connection form: it posts the messages of the form protocol.
export type FormApi = VsCodeApi<FormViewMessage>

export const FORM_CHANNEL: HostChannel<FormHostMessage, FormViewMessage> = {
  parse: parseFormHostMessage,
  problem: (message) => ({
    type: FormViewMessageType.Problem,
    message: `The connection form received a message it cannot read: ${message}`,
  }),
}

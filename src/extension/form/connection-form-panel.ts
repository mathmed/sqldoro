import * as vscode from 'vscode'

import { blockingIssues, FormAction } from '../../core/connection-form/form-state.ts'
import { parseFormViewMessage } from '../../core/connection-form/parse-webview-message.ts'
import {
  type FormHostMessage,
  FormHostMessageType,
  type FormSetup,
  type FormViewMessage,
  FormViewMessageType,
  type SubmittedDraft,
} from '../../core/connection-form/protocol.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { FIELD_LABELS, labelOf } from '../../core/connection/labels.ts'
import { applySecretChanges } from '../../core/connection/secrets.ts'
import type { PathField } from '../../core/connection/transitions.ts'
import { describeError } from '../../core/text/errors.ts'
import type { SecretChanges } from '../storage/secret-store.ts'
import type { FormRequest, FormServices } from './form-request.ts'
import { askFile } from './prompts.ts'
import { saveConnection } from './save-connection.ts'

type Handler = (message: FormViewMessage) => Promise<void>
type MessageOf<T extends FormViewMessage['type']> = Extract<FormViewMessage, { readonly type: T }>

function route<T extends FormViewMessage['type']>(
  type: T,
  handle: (message: MessageOf<T>) => Promise<void>,
): readonly [string, Handler] {
  return [type, async (message) => handle(message as MessageOf<T>)]
}

interface TestOutcome {
  readonly isSuccess: boolean
  readonly message: string
}

// The connection form of one connection: it sends the form what it needs, tests and saves what the
// form sends back. Each test, save and file dialog runs once at a time: a repeated click does nothing.
export class ConnectionFormPanel {
  readonly #panel: vscode.WebviewPanel
  readonly #request: FormRequest
  readonly #services: FormServices
  readonly #handlers: ReadonlyMap<string, Handler>
  readonly #loading = Promise.withResolvers<boolean>()
  #isClosed = false
  #isBrowsing = false
  #isTesting = false
  #isSaving = false

  constructor(panel: vscode.WebviewPanel, request: FormRequest, services: FormServices) {
    this.#panel = panel
    this.#request = request
    this.#services = services
    this.#handlers = new Map<string, Handler>([
      route(FormViewMessageType.Ready, async () => this.#ready()),
      route(FormViewMessageType.Browse, async (message) => this.#browse(message.field)),
      route(FormViewMessageType.Test, async (message) => this.#test(message.draft)),
      route(FormViewMessageType.Save, async (message) => this.#save(message.draft)),
      route(FormViewMessageType.Cancel, async () => this.#cancel()),
      route(FormViewMessageType.Problem, async (message) => this.#problem(message.message)),
    ])
  }

  get panel(): vscode.WebviewPanel {
    return this.#panel
  }

  // True once the form has loaded; false when it closed before.
  get whenLoaded(): Promise<boolean> {
    return this.#loading.promise
  }

  reveal(): void {
    this.#panel.reveal()
  }

  // The panel is gone: nothing is sent to it any more.
  close(): void {
    this.#isClosed = true
    this.#loading.resolve(false)
  }

  // Messages come from the webview: they are checked before anything is done with them.
  async receive(data: unknown): Promise<void> {
    let message: FormViewMessage
    try {
      message = parseFormViewMessage(data)
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error
      }
      this.#services.log.warn(
        `The connection form sent a message sqldoro cannot read: ${error.message}`,
      )
      return
    }
    await this.#handlers.get(message.type)?.(message)
  }

  #post(message: FormHostMessage): void {
    if (!this.#isClosed) {
      void this.#panel.webview.postMessage(message)
    }
  }

  // A form that (re)loads gets its setup, with what validating it takes as of now.
  async #ready(): Promise<void> {
    this.#loading.resolve(true)
    this.#post({ type: FormHostMessageType.Open, setup: this.#setup() })
    return Promise.resolve()
  }

  #setup(): FormSetup {
    const { mode, connection, heldSecrets, notices } = this.#request
    const { service, policy } = this.#services
    return {
      mode,
      connection,
      heldSecrets: [...heldSecrets],
      engines: service.engines.engines.map(({ id, displayName, defaultPort }) => ({
        id,
        displayName,
        defaultPort,
      })),
      takenNameKeys: [...service.takenNameKeys(connection.id)],
      productionEnvironments: [...policy().productionEnvironments],
      notices,
    }
  }

  async #browse(field: PathField): Promise<void> {
    if (this.#isBrowsing) {
      return
    }
    this.#isBrowsing = true
    try {
      const path = await askFile(labelOf(FIELD_LABELS, field))
      if (path !== undefined) {
        this.#post({ type: FormHostMessageType.File, field, path })
      }
    } finally {
      this.#isBrowsing = false
    }
  }

  async #test(draft: SubmittedDraft): Promise<void> {
    if (this.#isTesting) {
      return
    }
    this.#isTesting = true
    try {
      this.#post({ type: FormHostMessageType.Tested, ...(await this.#testOutcome(draft)) })
    } finally {
      this.#isTesting = false
    }
  }

  // The draft as it would be saved: the typed secrets over the ones the extension holds.
  async #testOutcome(draft: SubmittedDraft): Promise<TestOutcome> {
    const connection = this.#connectionOf(draft)
    const [issue] = blockingIssues(this.#services.service.validate(connection), FormAction.Test)
    if (issue !== undefined) {
      return { isSuccess: false, message: `Fix the connection first: ${issue.message}` }
    }
    try {
      const stored = await this.#services.secrets.read(connection)
      const secrets = applySecretChanges(stored, this.#secretChangesOf(draft))
      return {
        isSuccess: true,
        message: `Connected: ${await this.#services.test(connection, secrets)}`,
      }
    } catch (error) {
      return { isSuccess: false, message: describeError(error) }
    }
  }

  async #save(draft: SubmittedDraft): Promise<void> {
    if (this.#isSaving) {
      return
    }
    this.#isSaving = true
    const connection = this.#connectionOf(draft)
    const refusal = await saveConnection(this.#services, {
      request: this.#request,
      connection,
      secretChanges: this.#secretChangesOf(draft),
    })
    if (refusal !== undefined) {
      this.#isSaving = false
      this.#post({ type: FormHostMessageType.SaveRefused, ...refusal })
      return
    }
    this.#panel.dispose()
    void vscode.window.showInformationMessage(`Saved the connection "${connection.name}".`)
  }

  async #cancel(): Promise<void> {
    this.#panel.dispose()
    return Promise.resolve()
  }

  async #problem(message: string): Promise<void> {
    this.#services.log.warn(message)
    return Promise.resolve()
  }

  // The form edits this connection and no other, whatever id it sends.
  #connectionOf(draft: SubmittedDraft): ConnectionConfig {
    return { ...draft.connection, id: this.#request.connection.id }
  }

  #secretChangesOf(draft: SubmittedDraft): SecretChanges {
    return new Map([
      ...this.#request.pendingSecrets,
      ...draft.secretChanges.map((change) => [change.kind, change.value] as const),
    ])
  }
}

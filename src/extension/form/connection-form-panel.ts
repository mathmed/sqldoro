import * as vscode from 'vscode'

import { parseFormViewMessage } from '../../core/connection-form/parse-webview-message.ts'
import {
  type FormHostMessage,
  FormHostMessageType,
  FormMode,
  type FormSetup,
  FormStart,
  type FormViewMessage,
  FormViewMessageType,
  type SubmittedDraft,
} from '../../core/connection-form/protocol.ts'
import type { ConnectionConfig } from '../../core/connection/connection.ts'
import { FIELD_LABELS, labelOf } from '../../core/connection/labels.ts'
import { type ConnectionSecrets, SecretKind } from '../../core/connection/secrets.ts'
import type { PathField } from '../../core/connection/transitions.ts'
import type { SecretChanges } from '../storage/secret-store.ts'
import { checkOnServer, type ServerDraft, type ServerOutcome } from './draft-on-server.ts'
import type { FormRequest, FormServices, ServerCheck } from './form-request.ts'
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

// The connection form of one connection: it sends the form what it needs, and tests, saves, lists
// the databases of and imports what the form sends back. Each request of a kind runs once at a
// time: a repeated click does nothing.
export class ConnectionFormPanel {
  readonly #panel: vscode.WebviewPanel
  readonly #request: FormRequest
  readonly #services: FormServices
  readonly #handlers: ReadonlyMap<string, Handler>
  readonly #loading = Promise.withResolvers<boolean>()
  readonly #running = new Set<string>()
  #start: FormStart
  #isReady = false
  #isClosed = false
  // The secrets of the connection string imported in the form, kept here until it is saved.
  #urlSecrets: SecretChanges = new Map()

  constructor(panel: vscode.WebviewPanel, request: FormRequest, services: FormServices) {
    this.#panel = panel
    this.#request = request
    this.#services = services
    this.#start = request.start
    this.#handlers = new Map<string, Handler>([
      route(FormViewMessageType.Ready, async () => this.#ready()),
      route(FormViewMessageType.Browse, async ({ type, field }) =>
        this.#once(type, async () => this.#browse(field)),
      ),
      route(FormViewMessageType.Test, async ({ type, draft }) =>
        this.#once(type, async () => this.#test(draft)),
      ),
      route(FormViewMessageType.Save, async ({ type, draft }) =>
        this.#once(type, async () => this.#save(draft)),
      ),
      route(FormViewMessageType.Import, async (message) => this.#import(message.text)),
      route(FormViewMessageType.ListDatabases, async ({ type, draft }) =>
        this.#once(type, async () => this.#listDatabases(draft)),
      ),
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

  // Opens the input of a connection string: in the form, or as soon as it loads.
  showImport(): void {
    this.#start = FormStart.Import
    if (this.#isReady) {
      this.#post({ type: FormHostMessageType.ShowImport })
    }
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

  async #once(kind: string, run: () => Promise<void>): Promise<void> {
    if (this.#running.has(kind)) {
      return
    }
    this.#running.add(kind)
    try {
      await run()
    } finally {
      this.#running.delete(kind)
    }
  }

  // A form that (re)loads starts afresh, with what validating it takes as of now: the secrets of a
  // connection string imported before are forgotten with the rest of what was typed.
  async #ready(): Promise<void> {
    this.#isReady = true
    this.#urlSecrets = new Map()
    this.#loading.resolve(true)
    this.#post({ type: FormHostMessageType.Open, setup: this.#setup() })
    return Promise.resolve()
  }

  #setup(): FormSetup {
    const { mode, connection, storedSecrets } = this.#request
    const { service, policy } = this.#services
    return {
      mode,
      start: this.#start,
      connection,
      heldSecrets: [...storedSecrets],
      engines: service.engines.engines.map(({ id, displayName, defaultPort }) => ({
        id,
        displayName,
        defaultPort,
      })),
      takenNameKeys: [...service.takenNameKeys(connection.id)],
      productionEnvironments: [...policy().productionEnvironments],
    }
  }

  async #browse(field: PathField): Promise<void> {
    const path = await askFile(labelOf(FIELD_LABELS, field))
    if (path !== undefined) {
      this.#post({ type: FormHostMessageType.File, field, path })
    }
  }

  async #test(draft: SubmittedDraft): Promise<void> {
    const outcome = await this.#onServer(draft, this.#services.test)
    this.#post({
      type: FormHostMessageType.Tested,
      isSuccess: outcome.isSuccess,
      message: outcome.isSuccess ? `Connected: ${outcome.value}` : outcome.message,
    })
  }

  // A catalog query of sqldoro's own, in a session opened for it and closed again.
  async #listDatabases(draft: SubmittedDraft): Promise<void> {
    const outcome = await this.#onServer(draft, this.#services.listDatabases)
    this.#post(
      outcome.isSuccess
        ? { type: FormHostMessageType.Databases, names: [...outcome.value] }
        : { type: FormHostMessageType.DatabasesFailed, message: outcome.message },
    )
  }

  // The connection string fills the connection of this form; its password stays here, and the
  // form only learns there is one.
  async #import(text: string): Promise<void> {
    const result = this.#services.service.importUrl(text, this.#request.connection.id)
    if (!result.isValid) {
      this.#post({ type: FormHostMessageType.ImportRefused, message: result.message })
      return
    }
    const { connection, password, warnings } = result.imported
    this.#urlSecrets = new Map(password === '' ? [] : [[SecretKind.Password, password]])
    const urlSecrets = [...this.#urlSecrets.keys()]
    this.#post({ type: FormHostMessageType.Imported, connection, urlSecrets, warnings })
    return Promise.resolve()
  }

  // The draft as it would be saved, on its server.
  async #onServer<T>(draft: SubmittedDraft, check: ServerCheck<T>): Promise<ServerOutcome<T>> {
    const { service } = this.#services
    const readStored = async (connection: ConnectionConfig): Promise<ConnectionSecrets> =>
      this.#storedSecrets(connection)
    return checkOnServer({ service, readStored }, this.#draftOf(draft), check)
  }

  // A new connection has nothing stored: it connects with what was typed, and needs no keyring.
  async #storedSecrets(connection: ConnectionConfig): Promise<ConnectionSecrets> {
    return this.#request.mode === FormMode.New
      ? new Map<SecretKind, string>()
      : this.#services.secrets.read(connection)
  }

  async #save(draft: SubmittedDraft): Promise<void> {
    const { connection, secretChanges } = this.#draftOf(draft)
    const refusal = await saveConnection(this.#services, {
      request: this.#request,
      connection,
      secretChanges,
    })
    if (refusal !== undefined) {
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

  // The form edits this connection and no other, whatever id it sends; what it typed goes over the
  // secrets of an imported connection string.
  #draftOf(draft: SubmittedDraft): ServerDraft {
    return {
      connection: { ...draft.connection, id: this.#request.connection.id },
      secretChanges: new Map([
        ...this.#urlSecrets,
        ...draft.secretChanges.map((change) => [change.kind, change.value] as const),
      ]),
    }
  }
}

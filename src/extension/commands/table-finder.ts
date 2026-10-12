import * as vscode from 'vscode'

import { type SearchStatus, statusLine } from '../../core/table-search/status.ts'
import { CommandId } from '../command-id.ts'
import type { CommandContext } from './command-context.ts'
import { showFilterState } from './filter-state.ts'

const TITLE = 'Find Table in Explorer'
const PLACEHOLDER = 'Part of the name of a table or view'

type FinderContext = Pick<CommandContext, 'explorer' | 'setViewMessage'>

// Find Table in Explorer: an input box whose text filters the explorer on every keystroke, from the
// tables and views loaded in memory (FindMode). Enter opens the rows of the table that matches best
// and keeps the explorer filtered (Clear Filter gives the tree back); Escape gives the tree back at
// once. The box stays open while the user works in the tree, and asking for it again while it is
// open shows the same box: it never filters twice.
export class TableFinder {
  readonly #context: FinderContext
  #shown: FindBox | undefined

  constructor(context: FinderContext) {
    this.#context = context
  }

  // Resolves once the box closes.
  async find(): Promise<void> {
    this.#shown ??= new FindBox(this.#context, () => {
      this.#shown = undefined
    })
    return this.#shown.show()
  }
}

// One input box, from the moment it shows until it closes.
class FindBox {
  readonly #context: FinderContext
  readonly #box: vscode.InputBox
  readonly #closing = Promise.withResolvers<undefined>()

  constructor(context: FinderContext, onClose: () => void) {
    this.#context = context
    const { explorer } = context
    this.#box = vscode.window.createInputBox()
    this.#box.title = TITLE
    this.#box.placeholder = PLACEHOLDER
    this.#box.ignoreFocusOut = true
    this.#box.value = explorer.findStatus.text
    this.#follow(explorer.findStatus)
    this.#listen(onClose)
    explorer.prepareFind()
  }

  async show(): Promise<void> {
    this.#box.show()
    return this.#closing.promise
  }

  #listen(onClose: () => void): void {
    const { explorer } = this.#context
    let isAccepted = false
    const subscriptions = [
      explorer.onDidChangeFind((status) => {
        this.#follow(status)
      }),
      this.#box.onDidChangeValue((text) => {
        explorer.setFind(text)
      }),
      this.#box.onDidAccept(() => {
        isAccepted = true
        this.#box.hide()
      }),
    ]
    this.#box.onDidHide(() => {
      for (const disposable of [...subscriptions, this.#box]) {
        disposable.dispose()
      }
      onClose()
      this.#closing.resolve(this.#close(isAccepted))
    })
  }

  // The box follows where the search stands: a text cleared elsewhere (Clear Filter), how many
  // tables match and whether they still load.
  #follow(status: SearchStatus): void {
    if (status.text !== this.#box.value) {
      this.#box.value = status.text
    }
    this.#box.prompt = statusLine(status)
    this.#box.busy = status.isLoading
  }

  // Enter keeps the explorer filtered and opens the best match; anything else gives the tree back.
  async #close(isAccepted: boolean): Promise<undefined> {
    const { explorer } = this.#context
    const best = isAccepted ? explorer.bestMatch() : undefined
    if (!isAccepted) {
      explorer.setFind('')
    }
    await showFilterState(this.#context)
    if (best !== undefined) {
      await vscode.commands.executeCommand(CommandId.OpenTableData, best)
    }
    return undefined
  }
}

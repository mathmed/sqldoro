// Documents and editors that keep their text in memory, with the offset and position arithmetic of
// VS Code's.
import type { FakeUri } from './uri.ts'

export class Position {
  readonly line: number
  readonly character: number

  constructor(line: number, character: number) {
    this.line = line
    this.character = character
  }
}

export class Range {
  readonly start: Position
  readonly end: Position

  constructor(start: Position, end: Position) {
    this.start = start
    this.end = end
  }

  get isEmpty(): boolean {
    return this.start.line === this.end.line && this.start.character === this.end.character
  }
}

export class Selection extends Range {
  readonly anchor: Position
  readonly active: Position

  constructor(anchor: Position, active: Position) {
    const isBackwards =
      anchor.line > active.line ||
      (anchor.line === active.line && anchor.character > active.character)
    super(isBackwards ? active : anchor, isBackwards ? anchor : active)
    this.anchor = anchor
    this.active = active
  }
}

export class FakeTextDocument {
  readonly uri: FakeUri
  languageId: string
  text: string
  isClosed = false

  constructor(uri: FakeUri, text: string, languageId = 'sql') {
    this.uri = uri
    this.text = text
    this.languageId = languageId
  }

  get fileName(): string {
    return this.uri.path
  }

  close(): void {
    this.isClosed = true
  }

  getText(range?: Range): string {
    return range === undefined
      ? this.text
      : this.text.slice(this.offsetAt(range.start), this.offsetAt(range.end))
  }

  offsetAt(position: Position): number {
    const lines = this.text.split('\n')
    const before = lines.slice(0, position.line).reduce((sum, line) => sum + line.length + 1, 0)
    return Math.min(before + position.character, this.text.length)
  }

  positionAt(offset: number): Position {
    const before = this.text.slice(0, Math.max(0, Math.min(offset, this.text.length))).split('\n')
    return new Position(before.length - 1, before.at(-1)?.length ?? 0)
  }
}

export class FakeTextEditor {
  readonly document: FakeTextDocument
  selection: Selection

  constructor(
    document: FakeTextDocument,
    selection = new Selection(new Position(0, 0), new Position(0, 0)),
  ) {
    this.document = document
    this.selection = selection
  }

  get selections(): Selection[] {
    return [this.selection]
  }

  // Places the cursor (and the selection) by offsets, the way a user would.
  select(anchor: number, active = anchor): void {
    this.selection = new Selection(
      this.document.positionAt(anchor),
      this.document.positionAt(active),
    )
  }

  async edit(
    change: (builder: { replace: (range: Range, text: string) => void }) => void,
  ): Promise<boolean> {
    change({
      replace: (range, text) => {
        const start = this.document.offsetAt(range.start)
        const end = this.document.offsetAt(range.end)
        this.document.text = `${this.document.text.slice(0, start)}${text}${this.document.text.slice(end)}`
      },
    })
    return Promise.resolve(true)
  }
}

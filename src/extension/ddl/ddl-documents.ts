import * as vscode from 'vscode'

import { ObjectKind, type ObjectRef } from '../../core/engine/catalog.ts'
import type { EngineSession } from '../../core/engine/engine.ts'
import { readOneOf, readRecord, readString } from '../../core/json/record.ts'

export const DDL_SCHEME = 'sqldoro-ddl'

// What a DDL document shows: the object, and the connection whose explorer listed it.
export interface DdlTarget {
  readonly connectionId: string
  readonly object: ObjectRef
  readonly kind: ObjectKind
}

const OBJECT_KINDS: ReadonlySet<string> = new Set(Object.values(ObjectKind))

function isObjectKind(value: unknown): value is ObjectKind {
  return typeof value === 'string' && OBJECT_KINDS.has(value)
}

export function ddlUri(target: DdlTarget): vscode.Uri {
  const query = JSON.stringify({
    connectionId: target.connectionId,
    ...target.object,
    kind: target.kind,
  })
  return vscode.Uri.from({ scheme: DDL_SCHEME, path: `/${target.object.name}.sql`, query })
}

// The URI comes back from VS Code: it is read field by field.
export function ddlTargetOf(uri: vscode.Uri): DdlTarget {
  const record = readRecord(JSON.parse(uri.query))
  return {
    connectionId: readString(record, 'connectionId'),
    object: {
      database: readString(record, 'database'),
      schema: readString(record, 'schema'),
      name: readString(record, 'name'),
    },
    kind: readOneOf(record, 'kind', isObjectKind),
  }
}

// Read-only SQL documents with the definition of tables and views, as the server shows it (MySQL)
// or rebuilt from the catalog (PostgreSQL). Showing one again reads it again.
export class DdlDocuments implements vscode.TextDocumentContentProvider, vscode.Disposable {
  readonly #session: (connectionId: string) => EngineSession | undefined
  readonly #changes = new vscode.EventEmitter<vscode.Uri>()
  readonly onDidChange = this.#changes.event

  constructor(session: (connectionId: string) => EngineSession | undefined) {
    this.#session = session
  }

  async provideTextDocumentContent(uri: vscode.Uri): Promise<string> {
    const { connectionId, object, kind } = ddlTargetOf(uri)
    const session = this.#session(connectionId)
    if (session === undefined) {
      return '-- Not connected: connect to see the definition.\n'
    }
    return `${await session.objectDdl(object, kind)}\n`
  }

  refresh(uri: vscode.Uri): void {
    this.#changes.fire(uri)
  }

  dispose(): void {
    this.#changes.dispose()
  }
}

import type * as vscode from 'vscode'

import { tableDataLabel } from '../../core/results/table-data.ts'
import { tableTargetOf } from '../tables/table-uri.ts'

// How messages and titles name the source of results: the last part of the path of an editor's
// document, or the table of a table panel ("orders — sales").
export function documentLabel(uri: vscode.Uri): string {
  const target = tableTargetOf(uri)
  return target === undefined
    ? uri.path.slice(uri.path.lastIndexOf('/') + 1)
    : tableDataLabel(target.table)
}

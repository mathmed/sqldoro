import { homedir } from 'node:os'
import { join } from 'node:path'

import * as vscode from 'vscode'

import type { FileReader } from '../../core/platform.ts'

const HOME_PREFIX = '~/'
const decoder = new TextDecoder()

// Certificates and private keys are read through VS Code, where the extension runs; a path that
// starts with ~/ is in the user's home directory, as in a shell.
export const localFiles: FileReader = {
  readText: async (path) => {
    const location = path.startsWith(HOME_PREFIX)
      ? join(homedir(), path.slice(HOME_PREFIX.length))
      : path
    return decoder.decode(await vscode.workspace.fs.readFile(vscode.Uri.file(location)))
  },
}

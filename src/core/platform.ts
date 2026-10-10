import { describeError } from './text/errors.ts'

// Platform services the core needs, implemented by the extension host.
export interface FileReader {
  readonly readText: (path: string) => Promise<string>
}

export interface Logger {
  readonly debug: (message: string) => void
  readonly info: (message: string) => void
  readonly warn: (message: string) => void
  readonly error: (message: string) => void
}

export async function readFileFor(
  files: FileReader,
  path: string,
  purpose: string,
): Promise<string> {
  try {
    return await files.readText(path)
  } catch (error) {
    throw new Error(`Could not read the ${purpose} file "${path}": ${describeError(error)}`, {
      cause: error,
    })
  }
}

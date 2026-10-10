import { appendFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'

const MISSING_PATH = 'ENOENT'

export async function readText(path: string): Promise<string> {
  return readFile(path, 'utf8')
}

export async function writeText(path: string, text: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, text)
}

export async function appendText(path: string, text: string): Promise<void> {
  await appendFile(path, text)
}

export async function listFiles(directory: string): Promise<string[]> {
  try {
    return await readdir(directory)
  } catch (error) {
    if (isMissingPath(error)) {
      return []
    }
    throw error
  }
}

export async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size
}

export async function removeDirectory(path: string): Promise<void> {
  await rm(path, { recursive: true, force: true })
}

function isMissingPath(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === MISSING_PATH
}

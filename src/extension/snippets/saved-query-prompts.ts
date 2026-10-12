import { folderPaths, queryNameProblem } from '../../core/snippets/saved-queries.ts'
import { normalizeFolder } from '../../core/text/folder-paths.ts'
import { askChoice, askText } from '../form/prompts.ts'
import type { SavedQueryStore } from './saved-query-store.ts'

const NEW_FOLDER = Symbol('new folder')

export async function askQueryName(title: string, value: string): Promise<string | undefined> {
  const name = await askText({
    title,
    prompt: 'The name of the saved query',
    value,
    placeHolder: 'For example: Orders of the day',
    validate: queryNameProblem,
  })
  return name?.trim()
}

// A folder of the saved queries, the top level or a new one.
export async function askQueryFolder(
  store: Pick<SavedQueryStore, 'list'>,
  title: string,
): Promise<string | undefined> {
  const choice = await askChoice<string | typeof NEW_FOLDER>(title, [
    { label: '$(root-folder) Top level', value: '' },
    ...folderPaths(store.list()).map((path) => ({
      label: `$(folder) ${path}`,
      value: path,
    })),
    { label: '$(new-folder) New Folder…', value: NEW_FOLDER },
  ])
  if (choice !== NEW_FOLDER) {
    return choice
  }
  const folder = await askText({
    title: 'New Folder',
    prompt: 'Folders nest with /',
    value: '',
    placeHolder: 'For example: reports/monthly',
  })
  return folder === undefined ? undefined : normalizeFolder(folder)
}

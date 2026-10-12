// The buttons of the Connections title bar and the commands of the Command Palette are part of the
// public contract of package.json.
import { describe, expect, it } from 'vitest'

import manifest from '../../package.json' with { type: 'json' }
import { CommandId, ContextKey, ViewId } from './command-id.ts'

const NAVIGATION = 'navigation@'
const CONNECTIONS_VIEW = `view == ${ViewId.Connections}`

interface MenuEntry {
  readonly command: string
  readonly when?: string
  readonly group?: string
}

const TITLE: readonly MenuEntry[] = manifest.contributes.menus['view/title']
const PALETTE: readonly MenuEntry[] = manifest.contributes.menus.commandPalette

function positionOf({ group }: MenuEntry): number {
  return Number(group?.slice(NAVIGATION.length))
}

function connectionsTitleBar(): readonly MenuEntry[] {
  return TITLE.filter(
    ({ when, group }) =>
      when?.startsWith(CONNECTIONS_VIEW) === true && group?.startsWith(NAVIGATION) === true,
  ).toSorted((left, right) => positionOf(left) - positionOf(right))
}

describe('the Connections title bar', () => {
  it('should show Add Connection, Find Table in Explorer, Clear Filter and Refresh, in this order', () => {
    const sut = connectionsTitleBar()

    expect(sut.map(({ command }) => command)).toStrictEqual([
      CommandId.AddConnection,
      CommandId.FindTable,
      CommandId.ClearFilter,
      CommandId.Refresh,
    ])
    expect(sut.map(positionOf)).toStrictEqual([1, 2, 3, 4])
  })

  it('should show Clear Filter only while the explorer is filtered', () => {
    const sut = connectionsTitleBar().find(({ command }) => command === CommandId.ClearFilter)

    expect(sut?.when).toBe(`${CONNECTIONS_VIEW} && ${ContextKey.IsFiltered}`)
  })

  it('should leave Filter Tables and Views to the Command Palette', () => {
    const hidden = PALETTE.filter(({ when }) => when === 'false').map(({ command }) => command)

    expect(manifest.contributes.commands.map(({ command }) => command)).toContain(CommandId.Filter)
    expect(hidden).not.toContain(CommandId.Filter)
  })
})

describe('saving queries from the menus', () => {
  const editorTitle: readonly MenuEntry[] = manifest.contributes.menus['editor/title']
  const editorContext: readonly MenuEntry[] = manifest.contributes.menus['editor/context']
  const items: readonly MenuEntry[] = manifest.contributes.menus['view/item/context']
  const linked = `editorLangId == sql && ${ContextKey.IsSavedQueryEditor}`

  it('should show Save Query last in the title bar of every SQL editor', () => {
    const sut = editorTitle.toSorted((left, right) => positionOf(left) - positionOf(right)).at(-1)

    expect(sut).toStrictEqual({
      command: CommandId.SaveQuery,
      when: 'editorLangId == sql',
      group: 'navigation@5',
    })
  })

  it('should offer Save Query As beside Save Query only in the editor of a saved query', () => {
    const sut = editorContext.map(({ command }) => command)

    expect(sut.indexOf(CommandId.SaveQueryAs)).toBe(sut.indexOf(CommandId.SaveQuery) + 1)
    expect(editorContext.find(({ command }) => command === CommandId.SaveQueryAs)?.when).toBe(
      linked,
    )
    expect(PALETTE.find(({ command }) => command === CommandId.SaveQueryAs)?.when).toBe(linked)
  })

  it('should save a statement of the query history', () => {
    const sut = items.filter(({ command }) => command === CommandId.SaveQuery)

    expect(sut.map(({ when }) => when)).toStrictEqual([
      `view == ${ViewId.History} && viewItem == historyEntry`,
    ])
  })
})

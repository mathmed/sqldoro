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

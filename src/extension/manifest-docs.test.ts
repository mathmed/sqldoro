// The README is the users' reference for the public contract of package.json: every contributed
// command (with its shortcut) and every setting (with its default) is listed in it.
import { readFile } from 'node:fs/promises'

import { describe, expect, it } from 'vitest'

import manifest from '../../package.json' with { type: 'json' }

const README = await readFile(new URL('../../README.md', import.meta.url), 'utf8')
const TABLE_ROWS = README.split('\n').filter((line) => line.startsWith('|'))

function rowOf(command: string): string | undefined {
  const title = manifest.contributes.commands.find((entry) => entry.command === command)?.title
  return TABLE_ROWS.find((row) => row.includes(`**${String(title)}**`))
}

// "ctrl+shift+backspace" reads Ctrl+Shift+Backspace.
function keysOf(binding: string): string {
  return binding
    .split('+')
    .map((key) => key.charAt(0).toUpperCase() + key.slice(1))
    .join('+')
}

describe('the README', () => {
  it('should list every contributed command', () => {
    const missing = manifest.contributes.commands.filter(
      ({ command }) => rowOf(command) === undefined,
    )

    expect(missing.map(({ title }) => title)).toStrictEqual([])
  })

  it('should give every default keybinding next to its command', () => {
    for (const { command, key, mac } of manifest.contributes.keybindings) {
      expect(rowOf(command)).toContain(`\`${keysOf(key)}\` (\`${keysOf(mac)}\`)`)
    }
  })

  it('should list every setting with its default', () => {
    for (const [key, setting] of Object.entries(manifest.contributes.configuration.properties)) {
      const row = TABLE_ROWS.find((line) => line.includes(`\`${key}\``))

      expect(row).toContain(`\`${JSON.stringify(setting.default)}\``)
    }
  })
})

import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'

import { beforeAll, describe, expect, it } from 'vitest'
import oniguruma from 'vscode-oniguruma'
import textmate from 'vscode-textmate'

import manifest from '../../package.json' with { type: 'json' }

// The grammar sqldoro injects into VS Code's SQL grammar, tokenized as VS Code does: vscode-textmate
// on the Oniguruma regular expressions TextMate grammars are written in.
const INJECTION = 'sqldoro.sql-keywords.injection'
const SQL = 'source.sql'
const KEYWORD = 'keyword.other.sql'
// A stand-in for VS Code's own SQL grammar: its strings, quoted names and comments, the scopes the
// injection must stay out of.
const HOST_GRAMMAR = {
  scopeName: SQL,
  patterns: [
    { match: "'[^']*'", name: 'string.quoted.single.sql' },
    { match: '`[^`]*`', name: 'string.quoted.other.backtick.sql' },
    { match: '--.*$', name: 'comment.line.double-dash.sql' },
    { match: '/\\*.*?\\*/', name: 'comment.block.sql' },
  ],
}

const require = createRequire(import.meta.url)
let grammar: textmate.IGrammar | null = null

async function loadGrammars(): Promise<textmate.IGrammar | null> {
  const wasm = await readFile(require.resolve('vscode-oniguruma/release/onig.wasm'))
  await oniguruma.loadWASM(wasm.buffer)
  const [contribution] = manifest.contributes.grammars
  const injection = await readFile(
    new URL(`../../${String(contribution?.path)}`, import.meta.url),
    'utf8',
  )
  const grammars = new Map([
    [SQL, textmate.parseRawGrammar(JSON.stringify(HOST_GRAMMAR), 'sql.json')],
    [INJECTION, textmate.parseRawGrammar(injection, 'injection.json')],
  ])
  const registry = new textmate.Registry({
    onigLib: Promise.resolve({
      createOnigScanner: (sources) => new oniguruma.OnigScanner(sources),
      createOnigString: (text) => new oniguruma.OnigString(text),
    }),
    loadGrammar: async (scope) => Promise.resolve(grammars.get(scope) ?? null),
    getInjections: (scope) => (scope === SQL ? [INJECTION] : undefined),
  })
  return registry.loadGrammar(SQL)
}

// The words of the line its grammars color as keywords.
function keywordsOf(line: string): string[] {
  const tokens = grammar?.tokenizeLine(line, textmate.INITIAL).tokens ?? []
  return tokens
    .filter(({ scopes }) => scopes.includes(KEYWORD))
    .map(({ startIndex, endIndex }) => line.slice(startIndex, endIndex))
}

describe('the SQL keywords grammar', () => {
  beforeAll(async () => {
    grammar = await loadGrammars()
  })

  it('should be injected into the SQL grammar of VS Code', () => {
    expect(manifest.contributes.grammars).toStrictEqual([
      {
        scopeName: INJECTION,
        path: './syntaxes/sql-keywords.injection.tmLanguage.json',
        injectTo: [SQL],
      },
    ])
  })

  it.each(['flush privileges;', 'FLUSH PRIVILEGES;', 'Flush Privileges ;'])(
    'should color both words of %j as keywords',
    (line) => {
      expect(keywordsOf(line).map((word) => word.toLowerCase())).toEqual(['flush', 'privileges'])
    },
  )

  it.each([
    ['FLUSH TABLES WITH READ LOCK', ['FLUSH', 'TABLES', 'LOCK']],
    ['flush logs; flush hosts', ['flush', 'logs', 'flush', 'hosts']],
    ["CREATE USER 'claude'@'%' IDENTIFIED BY 'secret'", ['USER', 'IDENTIFIED']],
    [
      'SHOW GRANTS; show processlist; SHOW VARIABLES; show databases',
      ['SHOW', 'GRANTS', 'show', 'processlist', 'SHOW', 'VARIABLES', 'show', 'databases'],
    ],
    ['GRANT RELOAD ON *.* TO admin', ['RELOAD']],
    ['ANALYZE TABLE t; OPTIMIZE TABLE t; REPAIR TABLE t', ['ANALYZE', 'OPTIMIZE', 'REPAIR']],
    [
      'PURGE BINARY LOGS; INSTALL PLUGIN p; UNINSTALL PLUGIN p',
      ['PURGE', 'LOGS', 'INSTALL', 'PLUGIN', 'UNINSTALL', 'PLUGIN'],
    ],
  ])('should color the administration words of %j', (line, keywords) => {
    expect(keywordsOf(line)).toEqual(keywords)
  })

  it('should leave the same words alone in strings, quoted names and comments', () => {
    expect(keywordsOf("SELECT 'flush privileges', `user` -- show tables")).toEqual([])
    expect(keywordsOf('/* FLUSH LOGS */ SELECT 1')).toEqual([])
  })

  it('should leave qualified names and longer words alone', () => {
    expect(keywordsOf('SELECT user FROM mysql.user')).toEqual(['user'])
    expect(keywordsOf('SELECT * FROM information_schema.tables, tables . x')).toEqual([])
    expect(keywordsOf('SELECT flushed, user_id, show_tables, $user, privileges2 FROM t')).toEqual(
      [],
    )
  })
})

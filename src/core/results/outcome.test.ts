import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { ColumnKind } from '../engine/query.ts'
import {
  isOutcome,
  needsView,
  outcomeText,
  runOutcomeText,
  statementLabel,
  tabOutcomeText,
} from './outcome.ts'
import { TabKind, TabStatus } from './protocol.ts'

const COLUMN = { name: 'id', dataType: 'INT4', kind: ColumnKind.Number }
const DONE = { kind: TabKind.Rows, status: TabStatus.Succeeded, columns: [] }
const SUMMARY = { durationMs: 12, affectedRows: 3, isTruncated: false, autoLimit: null }

describe('isOutcome', () => {
  it('should hold a statement that ended without a result set', () => {
    expect(isOutcome(DONE)).toBe(true)
  })

  it.each([
    { ...DONE, columns: [COLUMN] },
    { ...DONE, kind: TabKind.Plan },
    { ...DONE, status: TabStatus.Running },
    { ...DONE, status: TabStatus.Failed },
    { ...DONE, status: TabStatus.Cancelled },
  ])('should not hold %j', (tab) => {
    expect(isOutcome(tab)).toBe(false)
  })
})

describe('needsView', () => {
  it.each([
    { ...DONE, columns: [COLUMN] },
    { ...DONE, status: TabStatus.Running, columns: [COLUMN] },
    { ...DONE, kind: TabKind.Plan },
    { ...DONE, status: TabStatus.Failed },
    { ...DONE, status: TabStatus.Cancelled },
  ])('should show %j in a result view', (tab) => {
    expect(needsView(tab)).toBe(true)
  })

  it('should not need a view for an outcome, nor for a statement running without columns', () => {
    expect(needsView(DONE)).toBe(false)
    expect(needsView({ ...DONE, status: TabStatus.Running })).toBe(false)
  })
})

describe('statementLabel', () => {
  it.each([
    ['update orders set paid = true', 'UPDATE'],
    ['/* why */ DELETE FROM t', 'DELETE'],
    ['ALTER TABLE t ADD c int', 'ALTER TABLE'],
    ['CREATE OR REPLACE VIEW v AS SELECT 1', 'CREATE VIEW'],
    ['create unique index i on t (a)', 'CREATE INDEX'],
    ['DROP TABLE IF EXISTS t', 'DROP TABLE'],
    ['TRUNCATE t', 'TRUNCATE'],
    ['TRUNCATE TABLE t', 'TRUNCATE TABLE'],
    ['CREATE a b c d TABLE t', 'CREATE'],
    ['SET search_path = x', 'SET'],
    ['', ''],
    ['(SELECT 1)', ''],
  ])('should name %j %j', (sql, label) => {
    expect(statementLabel(sql, POSTGRES_LEXICAL)).toBe(label)
  })

  it.each([
    'DATABASE',
    'DOMAIN',
    'EVENT',
    'EXTENSION',
    'FUNCTION',
    'INDEX',
    'POLICY',
    'PROCEDURE',
    'ROLE',
    'SCHEMA',
    'SEQUENCE',
    'TABLE',
    'TABLESPACE',
    'TRIGGER',
    'TYPE',
    'USER',
    'VIEW',
  ])('should name the %s a DDL statement acts on', (kind) => {
    expect(statementLabel(`DROP ${kind} x`, POSTGRES_LEXICAL)).toBe(`DROP ${kind}`)
    expect(statementLabel(`RENAME ${kind} x TO y`, POSTGRES_LEXICAL)).toBe(`RENAME ${kind}`)
  })

  it('should name other statements by their verb alone, whatever follows it', () => {
    expect(statementLabel('LOCK TABLE orders', POSTGRES_LEXICAL)).toBe('LOCK')
    expect(statementLabel('COMMENT ON TABLE orders IS NULL', POSTGRES_LEXICAL)).toBe('COMMENT')
  })

  it('should read the statement with the rules of its dialect', () => {
    expect(statementLabel('# note\nFLUSH PRIVILEGES', MYSQL_LEXICAL)).toBe('FLUSH')
    expect(statementLabel('# note\nFLUSH PRIVILEGES', POSTGRES_LEXICAL)).toBe('')
  })
})

describe('outcomeText', () => {
  it('should say how many rows a write affected, and how long it took', () => {
    expect(outcomeText('UPDATE', SUMMARY)).toBe('UPDATE: 3 rows affected · 12 ms')
    expect(outcomeText('INSERT', { ...SUMMARY, affectedRows: 1, durationMs: 1500 })).toBe(
      'INSERT: 1 row affected · 1.50 s',
    )
  })

  it.each(['COPY', 'DELETE', 'INSERT', 'LOAD', 'MERGE', 'REPLACE', 'UPDATE'])(
    'should count the rows a %s affected',
    (verb) => {
      expect(outcomeText(verb, SUMMARY)).toBe(`${verb}: 3 rows affected · 12 ms`)
    },
  )

  it('should say that any other statement is done, whatever the server counted', () => {
    expect(outcomeText('ALTER TABLE', { ...SUMMARY, affectedRows: 0, durationMs: 40 })).toBe(
      'ALTER TABLE done · 40 ms',
    )
    expect(outcomeText('DELETE', { ...SUMMARY, affectedRows: null })).toBe('DELETE done · 12 ms')
  })

  it('should name a statement that starts with no word, and leave out a time it does not have', () => {
    expect(outcomeText('', SUMMARY)).toBe('Statement done · 12 ms')
    expect(outcomeText('UPDATE', null)).toBe('UPDATE done')
  })
})

describe('tabOutcomeText', () => {
  it('should name the statement of a tab with the rules of its dialect', () => {
    expect(
      tabOutcomeText({ sql: '-- go\nUPDATE t SET a = 1', summary: SUMMARY }, POSTGRES_LEXICAL),
    ).toBe('UPDATE: 3 rows affected · 12 ms')
  })
})

describe('runOutcomeText', () => {
  const update = { sql: 'UPDATE t SET a = 1', summary: SUMMARY, notice: '' }

  it('should tell the outcome of one statement as it is', () => {
    expect(runOutcomeText([update], POSTGRES_LEXICAL)).toBe('UPDATE: 3 rows affected · 12 ms')
  })

  it('should count several, with what each one notes', () => {
    const alter = {
      sql: 'ALTER TABLE t ADD c int',
      summary: { ...SUMMARY, affectedRows: null, durationMs: 40 },
      notice: '1 statement after this one did not run.',
    }

    expect(runOutcomeText([update, alter], POSTGRES_LEXICAL)).toBe(
      '2 statements ran: UPDATE: 3 rows affected · 12 ms; ALTER TABLE done · 40 ms. 1 statement after this one did not run.',
    )
  })
})

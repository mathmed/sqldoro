import { describe, expect, it } from 'vitest'

import { fakeEngine } from '../../../test/fakes/engine.ts'
import { MYSQL_DIALECT, POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { EnvironmentTag, newConnection } from '../connection/connection.ts'
import { classifyScript } from './classify.ts'
import {
  assessRun,
  confirmationProblem,
  type GuardPolicy,
  type GuardTarget,
  isConfirmed,
  isProduction,
  productionEnvironments,
  Verdict,
  withEnvironment,
} from './guard.ts'

const POLICY: GuardPolicy = { productionEnvironments: new Set(['prod', 'staging']) }
const WRITABLE: GuardTarget = { name: 'Shop', environment: 'dev', isReadOnly: false }
const READ_ONLY: GuardTarget = { ...WRITABLE, isReadOnly: true }
const PRODUCTION: GuardTarget = { ...WRITABLE, environment: 'prod' }

function assess(script: string, target: GuardTarget): ReturnType<typeof assessRun> {
  return assessRun(classifyScript(script, POSTGRES_DIALECT), target, POLICY)
}

describe('assessRun on a read-only connection', () => {
  it.each([
    'SELECT * FROM orders',
    'BEGIN; SELECT 1; COMMIT',
    'EXPLAIN DELETE FROM t',
    'SHOW search_path',
    '',
  ])('should let %j run', (script) => {
    expect(assess(script, READ_ONLY)).toStrictEqual({ verdict: Verdict.Allow })
  })

  it('should block a statement that writes, and say how to write', () => {
    expect(assess('UPDATE t SET a = 1', READ_ONLY)).toStrictEqual({
      verdict: Verdict.Block,
      message:
        '"Shop" is read-only: sqldoro did not run this UPDATE. To write, allow writes on the connection first.',
      logLine: 'blocked UPDATE on "Shop": the connection is read-only',
    })
  })

  it('should say why a statement that looks like a read is blocked', () => {
    expect(assess("SELECT nextval('s')", READ_ONLY)).toMatchObject({
      message:
        '"Shop" is read-only: sqldoro did not run this SELECT (it calls nextval). To write, allow writes on the connection first.',
    })
  })

  it.each([
    ['SET default_transaction_read_only = off', 'SET'],
    ['BEGIN READ WRITE', 'BEGIN (it lets the transaction write)'],
    ['FROBNICATE t', 'FROBNICATE (sqldoro cannot tell what it does)'],
    ['CREATE TABLE t (a int)', 'CREATE'],
  ])('should block %s, which is not a read', (script, described) => {
    expect(assess(script, READ_ONLY)).toMatchObject({
      verdict: Verdict.Block,
      logLine: `blocked ${described} on "Shop": the connection is read-only`,
    })
  })

  it('should block a whole script when any of its statements writes, before anything runs', () => {
    expect(
      assess('SELECT 1; DELETE FROM t WHERE id = 1; DROP TABLE t; DELETE FROM u', READ_ONLY),
    ).toStrictEqual({
      verdict: Verdict.Block,
      message:
        '"Shop" is read-only: sqldoro did not run the script: 3 of its statements may write (DELETE, DROP). To write, allow writes on the connection first.',
      logLine: 'blocked DELETE, DROP on "Shop": the connection is read-only',
    })
  })
})

describe('assessRun on a writable connection', () => {
  it.each(['INSERT INTO t VALUES (1)', 'DELETE FROM t WHERE id = 1', 'DROP TABLE t'])(
    'should let %s run outside production',
    (script) => {
      expect(assess(script, WRITABLE)).toStrictEqual({ verdict: Verdict.Allow })
    },
  )

  it('should ask for a button before an UPDATE or a DELETE that reaches every row', () => {
    expect(assess('UPDATE orders SET paid = true', WRITABLE)).toStrictEqual({
      verdict: Verdict.Confirm,
      confirmations: [
        {
          kind: 'unfilteredWrite',
          style: 'button',
          reason: 'This UPDATE changes every row of orders: it has no WHERE.',
          button: 'Run the UPDATE of Every Row',
          logLine: 'UPDATE of every row of orders (it has no WHERE) confirmed',
        },
      ],
    })
  })

  it('should explain a WHERE that is always true, and ask for each statement', () => {
    expect(assess('DELETE FROM a WHERE 1 = 1; DELETE FROM (SELECT 1)', WRITABLE)).toStrictEqual({
      verdict: Verdict.Confirm,
      confirmations: [
        {
          kind: 'unfilteredWrite',
          style: 'button',
          reason: 'This DELETE deletes every row of a: its WHERE is always true.',
          button: 'Run the DELETE of Every Row',
          logLine: 'DELETE of every row of a (its WHERE is always true) confirmed',
        },
        {
          kind: 'unfilteredWrite',
          style: 'button',
          reason: 'This DELETE deletes every row of its table: it has no WHERE.',
          button: 'Run the DELETE of Every Row',
          logLine: 'DELETE of every row of its table (it has no WHERE) confirmed',
        },
      ],
    })
  })
})

describe('assessRun on production', () => {
  it('should ask for a button that names the connection, once for the writes of a run', () => {
    expect(
      assess(
        'SELECT 1; UPDATE t SET a = 1 WHERE id = 1; UPDATE t SET a = 2 WHERE id = 2',
        PRODUCTION,
      ),
    ).toStrictEqual({
      verdict: Verdict.Confirm,
      confirmations: [
        {
          kind: 'production',
          style: 'button',
          reason: '"Shop" is tagged PROD and this run changes it (UPDATE).',
          button: 'Run on Shop',
          logLine: 'PROD write on "Shop" (UPDATE) confirmed',
        },
      ],
    })
  })

  it('should have the table typed for an UPDATE or a DELETE of every row, and the run confirmed', () => {
    const sut = assess('DELETE FROM t; CREATE TABLE u (a int)', {
      ...PRODUCTION,
      environment: 'staging',
    })

    expect(sut).toStrictEqual({
      verdict: Verdict.Confirm,
      confirmations: [
        {
          kind: 'unfilteredWrite',
          style: 'typed',
          reason: 'This DELETE deletes every row of t: it has no WHERE.',
          button: 'Run the DELETE of Every Row',
          logLine: 'DELETE of every row of t (it has no WHERE) confirmed',
          title: 'DELETE of every row of t on "Shop" (STAGING)',
          prompt:
            'This DELETE deletes every row of t on "Shop" (STAGING): it has no WHERE. Type t to run it anyway.',
          expected: 't',
        },
        {
          kind: 'production',
          style: 'button',
          reason: '"Shop" is tagged STAGING and this run changes it (DELETE, CREATE).',
          button: 'Run on Shop',
          logLine: 'STAGING write on "Shop" (DELETE, CREATE) confirmed',
        },
      ],
    })
  })

  it('should have the verb typed when the table of every row is not known', () => {
    expect(assess('UPDATE (SELECT 1) SET a = 1', PRODUCTION)).toMatchObject({
      confirmations: [
        {
          style: 'typed',
          title: 'UPDATE of every row of its table on "Shop" (PROD)',
          prompt:
            'This UPDATE changes every row of its table on "Shop" (PROD): it has no WHERE. Type UPDATE to run it anyway.',
          expected: 'UPDATE',
        },
        { kind: 'production' },
      ],
    })
  })

  it.each(['SELECT 1', 'BEGIN', 'COMMIT', 'EXPLAIN ANALYZE SELECT 1'])(
    'should let %s run without asking',
    (script) => {
      expect(assess(script, PRODUCTION)).toStrictEqual({ verdict: Verdict.Allow })
    },
  )

  it('should block before asking anything on a read-only production connection', () => {
    expect(assess('DELETE FROM t', { ...PRODUCTION, isReadOnly: true }).verdict).toBe(Verdict.Block)
  })

  it('should classify with the rules of the dialect of the connection', () => {
    const script = "SELECT 1 # '; DROP TABLE t"

    expect(assessRun(classifyScript(script, MYSQL_DIALECT), READ_ONLY, POLICY).verdict).toBe(
      Verdict.Allow,
    )
    expect(assessRun(classifyScript(script, POSTGRES_DIALECT), READ_ONLY, POLICY).verdict).toBe(
      Verdict.Block,
    )
  })
})

describe('the production environments', () => {
  it('should always count prod, and the valid tags of the settings', () => {
    expect([...productionEnvironments([])]).toStrictEqual(['prod'])
    expect([...productionEnvironments(['staging', 'nope', 3, 'prod', 'none'])]).toStrictEqual([
      'prod',
      'staging',
      'none',
    ])
  })

  it('should tell production environments apart', () => {
    expect(isProduction('staging', POLICY)).toBe(true)
    expect(isProduction('dev', POLICY)).toBe(false)
  })

  it('should make a connection tagged as production read-only, and leave the others', () => {
    const writable = { ...newConnection('a', fakeEngine()), isReadOnly: false }

    expect(withEnvironment(writable, EnvironmentTag.Production, POLICY)).toMatchObject({
      environment: 'prod',
      isReadOnly: true,
    })
    expect(withEnvironment(writable, EnvironmentTag.Development, POLICY)).toMatchObject({
      environment: 'dev',
      isReadOnly: false,
    })
    expect(
      withEnvironment({ ...writable, isReadOnly: true }, EnvironmentTag.Local, POLICY).isReadOnly,
    ).toBe(true)
  })
})

describe('typed confirmations', () => {
  it('should accept exactly what is expected, give or take spaces around it', () => {
    expect(isConfirmed(' orders ', 'orders')).toBe(true)
    expect(isConfirmed('Shop', 'Shop ')).toBe(true)
    expect(isConfirmed('Orders', 'orders')).toBe(false)
    expect(isConfirmed('', 'orders')).toBe(false)
  })

  it('should say what to type until it is typed', () => {
    expect(confirmationProblem('ord', 'orders')).toBe('Type orders exactly to confirm')
    expect(confirmationProblem('orders', 'orders')).toBeUndefined()
  })
})

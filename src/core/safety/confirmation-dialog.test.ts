import { describe, expect, it } from 'vitest'

import { POSTGRES_DIALECT } from '../../../test/fixtures/dialects.ts'
import { classifyScript } from './classify.ts'
import { confirmationDialog, typedConfirmations } from './confirmation-dialog.ts'
import { assessRun, type Confirmation, type GuardTarget, Verdict } from './guard.ts'

const POLICY = { productionEnvironments: new Set(['prod']) }
const DEV: GuardTarget = { name: 'Shop', environment: 'dev', isReadOnly: false }
const PRODUCTION: GuardTarget = { ...DEV, environment: 'prod' }

function confirmationsOf(script: string, target: GuardTarget): readonly Confirmation[] {
  const decision = assessRun(classifyScript(script, POSTGRES_DIALECT), target, POLICY)
  if (decision.verdict !== Verdict.Confirm) {
    throw new Error(`${script} asks for no confirmation`)
  }
  return decision.confirmations
}

describe('confirmationDialog', () => {
  it('should name the connection, its environment, the statement and its table', () => {
    const sut = confirmationDialog(confirmationsOf('UPDATE orders SET paid = true', DEV), DEV)

    expect(sut).toStrictEqual({
      message: 'Run on "Shop" (DEV)?',
      detail: 'This UPDATE changes every row of orders: it has no WHERE.',
      button: 'Run the UPDATE of Every Row',
    })
  })

  it('should leave out the environment of a connection that has none', () => {
    const target = { ...DEV, environment: 'none' }

    expect(confirmationDialog(confirmationsOf('DELETE FROM t', target), target).message).toBe(
      'Run on "Shop"?',
    )
  })

  it('should list every confirmation of the run in one dialog, with one button', () => {
    const script = 'DELETE FROM a; UPDATE b SET c = 1'

    expect(confirmationDialog(confirmationsOf(script, DEV), DEV)).toStrictEqual({
      message: 'Run on "Shop" (DEV)?',
      detail: [
        'This DELETE deletes every row of a: it has no WHERE.',
        'This UPDATE changes every row of b: it has no WHERE.',
      ].join('\n'),
      button: 'Run Anyway',
    })
    expect(
      confirmationDialog(confirmationsOf('DELETE FROM a; DELETE FROM b', DEV), DEV).button,
    ).toBe('Run the DELETE of Every Row')
  })

  it('should run on production with a button that names the connection', () => {
    const script = 'INSERT INTO t VALUES (1); ALTER TABLE t ADD c int'

    expect(confirmationDialog(confirmationsOf(script, PRODUCTION), PRODUCTION)).toStrictEqual({
      message: 'Run on "Shop" (PROD)?',
      detail: '"Shop" is tagged PROD and this run changes it (INSERT, ALTER).',
      button: 'Run on Shop',
    })
  })

  it('should say that the table of an UPDATE of every row on production is typed next', () => {
    const confirmations = confirmationsOf('UPDATE orders SET paid = true', PRODUCTION)

    expect(confirmationDialog(confirmations, PRODUCTION)).toStrictEqual({
      message: 'Run on "Shop" (PROD)?',
      detail: [
        'This UPDATE changes every row of orders: it has no WHERE.',
        '"Shop" is tagged PROD and this run changes it (UPDATE).',
        'Then type orders to confirm the UPDATE of every row of orders on "Shop" (PROD).',
      ].join('\n'),
      button: 'Run on Shop',
    })
  })

  it('should run anyway when there is nothing to name', () => {
    expect(confirmationDialog([], DEV)).toStrictEqual({
      message: 'Run on "Shop" (DEV)?',
      detail: '',
      button: 'Run Anyway',
    })
  })
})

describe('typedConfirmations', () => {
  it('should ask to type only the tables of the UPDATE and DELETE of every row on production', () => {
    expect(typedConfirmations(confirmationsOf('DELETE FROM a', DEV))).toStrictEqual([])
    expect(
      typedConfirmations(confirmationsOf('DELETE FROM a; UPDATE b SET c = 1', PRODUCTION)).map(
        (typed) => typed.expected,
      ),
    ).toStrictEqual(['a', 'b'])
    expect(
      typedConfirmations(confirmationsOf('INSERT INTO a VALUES (1)', PRODUCTION)),
    ).toStrictEqual([])
  })
})

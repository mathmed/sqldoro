import { describe, expect, it } from 'vitest'

import {
  describeStatement,
  isHarmless,
  mergeClasses,
  StatementCategory,
  type StatementClass,
} from './statement-class.ts'

const { Read, Write, Ddl, Transaction, Session, Unknown } = StatementCategory

function statement(
  category: StatementCategory,
  verb = 'SELECT',
  unfiltered: StatementClass['unfiltered'] = [],
): StatementClass {
  return { category, verb, detail: '', unfiltered }
}

describe('isHarmless', () => {
  it.each([
    [Read, true],
    [Transaction, true],
    [Session, false],
    [Write, false],
    [Ddl, false],
    [Unknown, false],
  ])('should see whether a %s statement changes nothing by itself: %s', (category, isExpected) => {
    expect(isHarmless({ category })).toBe(isExpected)
  })
})

describe('mergeClasses', () => {
  it('should take the most dangerous statement, from read to unknown', () => {
    const order = [Read, Transaction, Session, Write, Ddl, Unknown]
    for (const [index, category] of order.entries()) {
      const safer = order.slice(0, index).map((other) => statement(other, other))
      const sut = mergeClasses([...safer, statement(category, category), ...safer])

      expect(sut.category).toBe(category)
    }
  })

  it('should keep the first of equally dangerous statements, and every unfiltered write', () => {
    const first = { verb: 'DELETE', table: 'a', hasAlwaysTrueWhere: false }
    const second = { verb: 'UPDATE', table: 'b', hasAlwaysTrueWhere: true }

    expect(
      mergeClasses([
        statement(Write, 'DELETE', [first]),
        statement(Read),
        statement(Write, 'UPDATE', [second]),
      ]),
    ).toStrictEqual({ category: Write, verb: 'DELETE', detail: '', unfiltered: [first, second] })
  })

  it('should treat a text without statements as unknown', () => {
    expect(mergeClasses([])).toStrictEqual({
      category: Unknown,
      verb: '',
      detail: 'there is no statement in it',
      unfiltered: [],
    })
  })
})

describe('describeStatement', () => {
  it('should say what the statement does and why it is not what it looks like', () => {
    expect(describeStatement({ verb: 'UPDATE', detail: '' })).toBe('UPDATE')
    expect(describeStatement({ verb: 'SELECT', detail: 'it calls nextval' })).toBe(
      'SELECT (it calls nextval)',
    )
    expect(describeStatement({ verb: '', detail: '' })).toBe('statement')
  })
})

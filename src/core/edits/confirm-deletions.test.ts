import { describe, expect, it } from 'vitest'

import { deletionConfirmation } from './confirm-deletions.ts'

const TARGET = { table: 'sales.orders', connection: 'Shop', isProduction: false }

describe('deletionConfirmation', () => {
  it('should ask nothing when no row is deleted', () => {
    expect(deletionConfirmation(0, TARGET)).toBeUndefined()
  })

  it('should ask for a button that says how many rows go', () => {
    expect(deletionConfirmation(1, TARGET)).toStrictEqual({
      isTyped: false,
      title: 'Delete 1 row of sales.orders',
      prompt: 'The changes delete 1 row of sales.orders on "Shop".',
      expected: 'Delete 1 Row',
    })
    expect(deletionConfirmation(1500, TARGET)).toMatchObject({
      title: 'Delete 1,500 rows of sales.orders',
      expected: 'Delete 1,500 Rows',
    })
  })

  it('should ask to type the number of rows on production', () => {
    expect(deletionConfirmation(3, { ...TARGET, isProduction: true })).toStrictEqual({
      isTyped: true,
      title: 'Delete 3 rows of sales.orders',
      prompt:
        '"Shop" is production and the changes delete 3 rows of sales.orders. Type 3 to delete them.',
      expected: '3',
    })
    expect(deletionConfirmation(1, { ...TARGET, isProduction: true })?.prompt).toBe(
      '"Shop" is production and the changes delete 1 row of sales.orders. Type 1 to delete it.',
    )
  })
})

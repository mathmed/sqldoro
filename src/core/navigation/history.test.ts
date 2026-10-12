import { describe, expect, it } from 'vitest'

import { FilterOperator } from '../results/conditions.ts'
import { IDENTITY_VIEW } from '../results/view.ts'
import {
  canMoveBy,
  crumbsOf,
  currentStep,
  isQueryStep,
  MAX_STEPS,
  moveBy,
  moveToStep,
  type Navigation,
  pushStep,
  startNavigation,
  stepLabel,
  withCurrent,
  withQuery,
} from './history.ts'

const CONDOMINIUM = { database: 'bank', schema: 'public', name: 'Condominium' }
const ACCOUNT = { database: 'bank', schema: 'public', name: 'CondominiumBankAccount' }
const AUDIT = { database: 'bank', schema: 'audit', name: 'Entry' }
const BY_CONDOMINIUM = { parts: [{ column: 'condominiumId', value: 1 }], isRowKey: false }
const ONE_ROW = { parts: [{ column: 'id', value: 3 }], isRowKey: true }

function trail(): Navigation {
  const start = withCurrent(startNavigation({ table: CONDOMINIUM, key: undefined }), {
    departure: '#1',
  })
  return pushStep(start, { table: ACCOUNT, key: BY_CONDOMINIUM })
}

describe('startNavigation and pushStep', () => {
  it('should start on the table, with its rows as they come', () => {
    const sut = startNavigation({ table: CONDOMINIUM, key: undefined })

    expect(sut).toStrictEqual({
      steps: [
        {
          id: 0,
          table: CONDOMINIUM,
          key: undefined,
          condition: '',
          view: IDENTITY_VIEW,
          columns: [],
          departure: '',
          query: '',
        },
      ],
      index: 0,
      nextId: 1,
    })
  })

  it('should go on to a new step, which is shown', () => {
    const sut = trail()

    expect(sut.index).toBe(1)
    expect(sut.nextId).toBe(2)
    expect(currentStep(sut)).toMatchObject({ id: 1, table: ACCOUNT, key: BY_CONDOMINIUM })
  })

  it('should drop the steps forward of the one shown', () => {
    const back = moveBy(trail(), -1)
    const sut = pushStep(back ?? trail(), { table: AUDIT, key: undefined })

    expect(sut.steps.map((step) => step.id)).toStrictEqual([0, 2])
    expect(sut.index).toBe(1)
  })

  it('should keep the last steps only', () => {
    let sut = startNavigation({ table: CONDOMINIUM, key: undefined })
    for (let count = 0; count < MAX_STEPS + 5; count += 1) {
      sut = pushStep(sut, { table: ACCOUNT, key: undefined })
    }

    expect(sut.steps).toHaveLength(MAX_STEPS)
    expect(sut.index).toBe(MAX_STEPS - 1)
    expect(sut.steps.at(0)?.id).toBe(6)
    expect(sut.steps.at(-1)?.id).toBe(MAX_STEPS + 5)
  })
})

describe('pushStep from another trail', () => {
  it('should take the trail up to the step shown, then the new step', () => {
    const from = moveBy(pushStep(trail(), { table: AUDIT, key: undefined }), -1) ?? trail()
    const sut = pushStep(from, { table: CONDOMINIUM, key: ONE_ROW })

    expect(sut.steps.map((step) => step.id)).toStrictEqual([0, 1, 3])
    expect(currentStep(sut).key).toBe(ONE_ROW)
  })
})

describe('withCurrent', () => {
  it('should change the step shown only', () => {
    const view = {
      sort: [{ column: 0, isDescending: true }],
      filters: [{ column: 1, operator: FilterOperator.IsNull, values: [] }],
    }
    const sut = withCurrent(trail(), { condition: 'id > 1', view, columns: ['id', 'name'] })

    expect(currentStep(sut)).toMatchObject({ condition: 'id > 1', view, columns: ['id', 'name'] })
    expect(sut.steps.at(0)).toMatchObject({ condition: '', view: IDENTITY_VIEW, departure: '#1' })
  })
})

describe('moving', () => {
  it('should go back and forward inside the trail only', () => {
    const sut = trail()
    const back = moveBy(sut, -1)

    expect(back?.index).toBe(0)
    expect(back === undefined ? undefined : moveBy(back, 1)?.index).toBe(1)
    expect(moveBy(sut, 1)).toBeUndefined()
    expect(back === undefined ? undefined : moveBy(back, -1)).toBeUndefined()
    expect(canMoveBy(sut, -1)).toBe(true)
    expect(canMoveBy(sut, 1)).toBe(false)
  })

  it('should go to a step of the trail by its id, not to the one shown', () => {
    expect(moveToStep(trail(), 0)?.index).toBe(0)
    expect(moveToStep(trail(), 1)).toBeUndefined()
    expect(moveToStep(trail(), 7)).toBeUndefined()
  })

  it('should fail loudly on a navigation that shows no step', () => {
    expect(() => currentStep({ steps: [], index: 0, nextId: 0 })).toThrow(RangeError)
    expect(() => crumbsOf({ steps: [], index: 0, nextId: 0 })).toThrow(
      'The navigation has no step 0',
    )
  })
})

describe('crumbsOf and stepLabel', () => {
  it('should name each step by its table and its row', () => {
    expect(crumbsOf(trail())).toStrictEqual([
      { id: 0, label: 'Condominium #1', isCurrent: false, isQuery: false },
      {
        id: 1,
        label: 'CondominiumBankAccount (condominiumId = 1)',
        isCurrent: true,
        isQuery: false,
      },
    ])
  })

  it('should name a row reached by its key, and a table of another schema with it', () => {
    const sut = pushStep(trail(), { table: AUDIT, key: ONE_ROW })

    expect(crumbsOf(sut).at(-1)?.label).toBe('audit.Entry #3')
    expect(
      stepLabel(currentStep(startNavigation({ table: AUDIT, key: undefined })), CONDOMINIUM),
    ).toBe('audit.Entry')
  })
})

describe('withQuery', () => {
  const JOIN = 'SELECT * FROM "Condominium" JOIN "CondominiumBankAccount" USING (id)'

  it('should run a query of the query box as a step of its own, on the table shown', () => {
    const sut = withQuery(trail(), JOIN)

    expect(sut.steps.map((step) => step.id)).toStrictEqual([0, 1, 2])
    expect(sut.index).toBe(2)
    expect(currentStep(sut)).toStrictEqual({
      id: 2,
      table: ACCOUNT,
      key: undefined,
      condition: '',
      view: IDENTITY_VIEW,
      columns: [],
      departure: '',
      query: JOIN,
    })
    expect(isQueryStep(currentStep(sut))).toBe(true)
    expect(isQueryStep(currentStep(trail()))).toBe(false)
  })

  it('should run another query in place of the query step shown, not after it', () => {
    const first = withCurrent(withQuery(trail(), JOIN), { departure: '#2' })
    const sut = withQuery(first, 'SELECT 1')

    expect(sut.steps.map((step) => step.id)).toStrictEqual([0, 1, 2])
    expect(currentStep(sut)).toMatchObject({ id: 2, query: 'SELECT 1', departure: '' })
  })

  it('should drop the steps forward of the one it was run from', () => {
    const back = moveBy(trail(), -1) ?? trail()
    const sut = withQuery(back, JOIN)

    expect(sut.steps.map((step) => step.id)).toStrictEqual([0, 2])
    expect(currentStep(sut).table).toBe(CONDOMINIUM)
  })

  it('should name the step of a query, and the row left from it', () => {
    const sut = withCurrent(withQuery(trail(), JOIN), { departure: '#4' })

    expect(crumbsOf(sut).map((crumb) => crumb.label)).toStrictEqual([
      'Condominium #1',
      'CondominiumBankAccount (condominiumId = 1)',
      'Query #4',
    ])
    expect(stepLabel(currentStep(withQuery(trail(), JOIN)), CONDOMINIUM)).toBe('Query')
  })
})

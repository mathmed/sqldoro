import { describe, expect, it } from 'vitest'

import { FakeMemento } from '../../../test/fakes/extension-context.ts'
import { QueryBoxHeight } from './query-box-height.ts'

describe('QueryBoxHeight', () => {
  it('should keep the height the user gave the box in the state of the workspace', async () => {
    const memento = new FakeMemento()
    const sut = new QueryBoxHeight(memento)
    expect(sut.get()).toBeNull()

    await sut.set(220)

    expect(sut.get()).toBe(220)
    expect(new QueryBoxHeight(memento).get()).toBe(220)
    expect(memento.get('sqldoro.queryBoxHeight')).toBe(220)
  })

  it('should not take what is kept there when it is not a height', async () => {
    const memento = new FakeMemento()
    await memento.update('sqldoro.queryBoxHeight', 'tall')

    expect(new QueryBoxHeight(memento).get()).toBeNull()
  })
})

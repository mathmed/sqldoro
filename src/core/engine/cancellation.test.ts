import { describe, expect, it, type Mock, vi } from 'vitest'

import { NOT_STOPPED, notAsked, REQUEST_LATE } from '../../../test/support/cancel.ts'
import {
  CANCEL_TIMEOUT_MS,
  Cancellation,
  type Stopper,
  untilDeadline,
  type Wait,
} from './cancellation.ts'

// A timer the test moves on by hand: every wait ends when pass() is called.
interface HandTimer {
  readonly wait: Wait
  readonly pass: () => void
  readonly waits: number[]
}

function handTimer(): HandTimer {
  const { promise, resolve } = Promise.withResolvers<undefined>()
  const waits: number[] = []
  return {
    wait: async (milliseconds) => {
      waits.push(milliseconds)
      return promise
    },
    pass: () => {
      resolve(undefined)
    },
    waits,
  }
}

function stopper(
  kill: Stopper['kill'],
): Stopper & { readonly drop: Mock<(reason: Error) => void> } {
  return { kill, drop: vi.fn<(reason: Error) => void>() }
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve))
}

describe('Cancellation', () => {
  it('should ask the server once, let every call wait, and end when the statement does', async () => {
    const timer = handTimer()
    const sut = new Cancellation(timer.wait)
    const steps = stopper(vi.fn(async () => Promise.resolve()))

    const cancels = Promise.all([sut.cancel(steps), sut.cancel(steps)])
    await settle()
    await sut.finish()
    await cancels

    expect(steps.kill).toHaveBeenCalledOnce()
    expect(timer.waits).toStrictEqual([CANCEL_TIMEOUT_MS])
    expect(CANCEL_TIMEOUT_MS).toBe(3000)
    expect(steps.drop).not.toHaveBeenCalled()
    expect(sut.isRequested).toBe(true)
    expect(sut.cancelledError()).toMatchObject({
      message: 'The query was cancelled',
      hasClosedConnection: false,
    })
  })

  it('should not be requested until cancel is called', () => {
    expect(new Cancellation(handTimer().wait).isRequested).toBe(false)
  })

  it('should ignore a cancel once the statement is over', async () => {
    const timer = handTimer()
    const sut = new Cancellation(timer.wait)
    const steps = stopper(vi.fn(async () => Promise.resolve()))

    await sut.finish()
    await sut.cancel(steps)

    expect(steps.kill).not.toHaveBeenCalled()
    expect(timer.waits).toStrictEqual([])
    expect(sut.isRequested).toBe(false)
  })

  it('should close the connection when the statement has not ended by the deadline', async () => {
    const timer = handTimer()
    const sut = new Cancellation(timer.wait)
    const steps = stopper(async () => Promise.resolve())
    let hasEnded = false

    const cancelled = sut.cancel(steps).then(() => {
      hasEnded = true
    })
    await settle()
    expect(hasEnded).toBe(false)
    expect(steps.drop).not.toHaveBeenCalled()
    timer.pass()
    await cancelled

    expect(steps.drop).toHaveBeenCalledExactlyOnceWith(new Error(NOT_STOPPED))
    expect(sut.cancelledError()).toMatchObject({
      message: 'The query was cancelled: sqldoro closed its connection',
      hasClosedConnection: true,
    })
  })

  it('should close the connection at once when the server cannot be asked', async () => {
    const sut = new Cancellation(handTimer().wait)
    const refused = new Error('Too many connections')
    const steps = stopper(async () => Promise.reject(refused))

    await sut.cancel(steps)

    expect(steps.drop).toHaveBeenCalledOnce()
    const [reason] = steps.drop.mock.calls[0] ?? []
    expect(reason).toBeInstanceOf(Error)
    expect(reason).toMatchObject({
      message: notAsked('Too many connections'),
      cause: refused,
    })
    expect(sut.cancelledError().hasClosedConnection).toBe(true)
  })

  it('should leave the connection when the request fails after the statement ended', async () => {
    const sut = new Cancellation(handTimer().wait)
    const { promise, reject } = Promise.withResolvers<undefined>()
    const steps = stopper(async () => promise)

    const cancelled = sut.cancel(steps)
    const finished = sut.finish()
    reject(new Error('Unknown thread id: 42'))
    await finished

    await expect(cancelled).resolves.toBeUndefined()
    expect(steps.drop).not.toHaveBeenCalled()
  })

  it('should close the connection when the request is on its way at the deadline, even once the statement ended', async () => {
    const timer = handTimer()
    const sut = new Cancellation(timer.wait)
    const { promise, reject } = Promise.withResolvers<undefined>()
    const steps = stopper(async (deadline) => {
      await deadline
      return promise
    })
    let hasFinished = false

    const cancelled = sut.cancel(steps)
    const finished = sut.finish().then(() => {
      hasFinished = true
    })
    timer.pass()
    await settle()
    expect(steps.drop).toHaveBeenCalledExactlyOnceWith(new Error(REQUEST_LATE))
    expect(hasFinished).toBe(false)
    reject(new Error('given up'))
    await finished

    await expect(cancelled).resolves.toBeUndefined()
    expect(sut.cancelledError().hasClosedConnection).toBe(true)
  })

  it('should finish only after the cancel in flight, and report its failure to the callers of cancel', async () => {
    const sut = new Cancellation(handTimer().wait)
    const steps = {
      kill: async () => Promise.reject(new Error('refused')),
      drop: () => {
        throw new Error('no socket')
      },
    }

    const cancelled = sut.cancel(steps)

    await expect(cancelled).rejects.toThrow('no socket')
    await expect(sut.finish()).resolves.toBeUndefined()
  })
})

describe('untilDeadline', () => {
  it('should give what the work gives in time, and abandon nothing', async () => {
    const timer = handTimer()
    const abandon = vi.fn()

    await expect(untilDeadline(Promise.resolve(7), timer.wait(1), abandon)).resolves.toBe(7)
    timer.pass()
    await settle()

    expect(abandon).not.toHaveBeenCalled()
  })

  it('should fail as the work fails in time, and abandon nothing', async () => {
    const timer = handTimer()
    const abandon = vi.fn()

    await expect(
      untilDeadline(Promise.reject(new Error('refused')), timer.wait(1), abandon),
    ).rejects.toThrow('refused')
    timer.pass()
    await settle()

    expect(abandon).not.toHaveBeenCalled()
  })

  it('should abandon the work and fail once the deadline passes first', async () => {
    const timer = handTimer()
    const abandon = vi.fn()

    const sut = untilDeadline(Promise.withResolvers<never>().promise, timer.wait(1), abandon)
    timer.pass()

    await expect(sut).rejects.toThrow(
      new Error('The request to stop the statement did not end within 3 s.'),
    )
    expect(abandon).toHaveBeenCalledOnce()
  })
})

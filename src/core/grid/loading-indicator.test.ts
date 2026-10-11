import { describe, expect, it } from 'vitest'

import {
  FADE_MS,
  IDLE_INDICATOR,
  type Indicator,
  IndicatorLook,
  MIN_SHOWN_MS,
  nextChangeAt,
  SHOW_DELAY_MS,
  stepIndicator,
  waitedMs,
} from './loading-indicator.ts'

const START = 1000

// The indicator after each step, from idle: [waiting or not, at].
function after(steps: readonly (readonly [boolean, number])[]): Indicator {
  return steps.reduce(
    (indicator, [isWaiting, now]) => stepIndicator(indicator, isWaiting, now),
    IDLE_INDICATOR,
  )
}

const WAITING: Indicator = after([[true, START]])
const SHOWN: Indicator = after([
  [true, START],
  [true, START + SHOW_DELAY_MS],
])
const SHOWN_AT = START + SHOW_DELAY_MS

describe('stepIndicator', () => {
  it('should stay hidden and idle while nothing is awaited', () => {
    const sut = stepIndicator(IDLE_INDICATOR, false, START)

    expect(sut).toBe(IDLE_INDICATOR)
  })

  it('should note when a wait begins and stay hidden for a moment', () => {
    expect(WAITING).toStrictEqual({
      look: IndicatorLook.Hidden,
      lookSince: 0,
      wait: { since: START, until: null },
    })
    expect(stepIndicator(WAITING, true, START + SHOW_DELAY_MS - 1)).toBe(WAITING)
  })

  it('should show nothing for a wait that ends before the delay', () => {
    const sut = after([
      [true, START],
      [false, START + SHOW_DELAY_MS - 1],
    ])

    expect(sut).toStrictEqual({
      look: IndicatorLook.Hidden,
      lookSince: 0,
      wait: { since: START, until: START + SHOW_DELAY_MS - 1 },
    })
    expect(stepIndicator(sut, false, START + SHOW_DELAY_MS * 2)).toBe(sut)
  })

  it('should appear once the wait has lasted the delay', () => {
    expect(SHOWN).toStrictEqual({
      look: IndicatorLook.Shown,
      lookSince: SHOWN_AT,
      wait: { since: START, until: null },
    })
    expect(stepIndicator(SHOWN, true, SHOWN_AT + 5000)).toBe(SHOWN)
  })

  it('should stay its minimum time when the wait ends soon after it appeared', () => {
    const ended = stepIndicator(SHOWN, false, SHOWN_AT + 10)

    expect(ended).toStrictEqual({
      look: IndicatorLook.Shown,
      lookSince: SHOWN_AT,
      wait: { since: START, until: SHOWN_AT + 10 },
    })
    expect(stepIndicator(ended, false, SHOWN_AT + MIN_SHOWN_MS - 1)).toBe(ended)
    expect(stepIndicator(ended, false, SHOWN_AT + MIN_SHOWN_MS)).toStrictEqual({
      look: IndicatorLook.Leaving,
      lookSince: SHOWN_AT + MIN_SHOWN_MS,
      wait: { since: START, until: SHOWN_AT + 10 },
    })
  })

  it('should fade out at once when the wait ends after its minimum time', () => {
    const sut = stepIndicator(SHOWN, false, SHOWN_AT + MIN_SHOWN_MS + 50)

    expect(sut.look).toBe(IndicatorLook.Leaving)
    expect(sut.lookSince).toBe(SHOWN_AT + MIN_SHOWN_MS + 50)
  })

  it('should be gone once it has faded out', () => {
    const leaving = stepIndicator(SHOWN, false, SHOWN_AT + MIN_SHOWN_MS)

    expect(stepIndicator(leaving, false, SHOWN_AT + MIN_SHOWN_MS + FADE_MS - 1)).toBe(leaving)
    expect(stepIndicator(leaving, false, SHOWN_AT + MIN_SHOWN_MS + FADE_MS)).toStrictEqual({
      look: IndicatorLook.Hidden,
      lookSince: SHOWN_AT + MIN_SHOWN_MS + FADE_MS,
      wait: { since: START, until: SHOWN_AT + MIN_SHOWN_MS },
    })
  })

  it('should come back at once, with a new wait, when the view waits again while it fades', () => {
    const leaving = stepIndicator(SHOWN, false, SHOWN_AT + MIN_SHOWN_MS)
    const again = SHOWN_AT + MIN_SHOWN_MS + 20

    expect(stepIndicator(leaving, true, again)).toStrictEqual({
      look: IndicatorLook.Shown,
      lookSince: again,
      wait: { since: again, until: null },
    })
  })

  it('should stay, counting a new wait, when the view waits again before it goes', () => {
    const ended = stepIndicator(SHOWN, false, SHOWN_AT + 10)
    const again = SHOWN_AT + 20

    expect(stepIndicator(ended, true, again)).toStrictEqual({
      look: IndicatorLook.Shown,
      lookSince: SHOWN_AT,
      wait: { since: again, until: null },
    })
  })

  it('should wait the whole delay again for a new wait once it is gone', () => {
    const gone = after([
      [true, START],
      [false, START + 10],
    ])
    const again = stepIndicator(gone, true, START + 500)

    expect(again).toStrictEqual({
      look: IndicatorLook.Hidden,
      lookSince: 0,
      wait: { since: START + 500, until: null },
    })
    expect(stepIndicator(again, true, START + 500 + SHOW_DELAY_MS).look).toBe(IndicatorLook.Shown)
  })
})

describe('nextChangeAt', () => {
  it('should not change on its own while idle or after a short wait', () => {
    expect(nextChangeAt(IDLE_INDICATOR)).toBeNull()
    expect(
      nextChangeAt(
        after([
          [true, START],
          [false, START + 10],
        ]),
      ),
    ).toBeNull()
  })

  it('should appear when the delay of the wait is over', () => {
    expect(nextChangeAt(WAITING)).toBe(START + SHOW_DELAY_MS)
  })

  it('should not change on its own while shown and the wait goes on', () => {
    expect(nextChangeAt(SHOWN)).toBeNull()
  })

  it('should fade out when its minimum time is over, then be gone after the fade', () => {
    const ended = stepIndicator(SHOWN, false, SHOWN_AT + 10)
    const leaving = stepIndicator(ended, false, SHOWN_AT + MIN_SHOWN_MS)

    expect(nextChangeAt(ended)).toBe(SHOWN_AT + MIN_SHOWN_MS)
    expect(nextChangeAt(leaving)).toBe(SHOWN_AT + MIN_SHOWN_MS + FADE_MS)
  })

  it('should not change on its own while it fades and the view waits again', () => {
    const leaving: Indicator = {
      look: IndicatorLook.Leaving,
      lookSince: START,
      wait: { since: START, until: null },
    }

    expect(nextChangeAt(leaving)).toBeNull()
  })
})

describe('waitedMs', () => {
  it('should count nothing before any wait', () => {
    expect(waitedMs(null, START)).toBe(0)
  })

  it('should count until now while the wait goes on, and until its end once it ended', () => {
    expect(waitedMs({ since: START, until: null }, START + 250)).toBe(250)
    expect(waitedMs({ since: START, until: START + 100 }, START + 900)).toBe(100)
  })

  it('should never count a negative time', () => {
    expect(waitedMs({ since: START, until: null }, START - 5)).toBe(0)
  })
})

describe('the timing', () => {
  it('should wait long enough to skip fast loads and show a card long enough to read', () => {
    expect([SHOW_DELAY_MS, MIN_SHOWN_MS, FADE_MS]).toStrictEqual([300, 400, 150])
  })
})

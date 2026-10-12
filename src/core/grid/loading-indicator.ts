// When the view shows that it waits (a card over the grid, the rows of before dimmed): only for a
// wait long enough to notice, then long enough to read, fading in and out. A fast load shows
// nothing; a slow one never blinks.

// A wait shorter than this shows no indicator.
export const SHOW_DELAY_MS = 300
// Once shown, the indicator stays at least this long, even when the wait ends sooner.
export const MIN_SHOWN_MS = 400
// How long it fades out (panels.css fades it in and out in this time).
export const FADE_MS = 150

export const IndicatorLook = {
  Hidden: 'hidden',
  Shown: 'shown',
  // Fading out: still on the page, on its way out.
  Leaving: 'leaving',
} as const

export type IndicatorLook = (typeof IndicatorLook)[keyof typeof IndicatorLook]

// A wait: when it began, and when it ended (null while it goes on).
export interface Wait {
  readonly since: number
  readonly until: number | null
}

export interface Indicator {
  readonly look: IndicatorLook
  // When the look last changed: the indicator appeared, or began to fade out.
  readonly lookSince: number
  // The last wait; null before the first.
  readonly wait: Wait | null
}

export const IDLE_INDICATOR: Indicator = { look: IndicatorLook.Hidden, lookSince: 0, wait: null }

// The indicator at `now`, as the view waits or not; the same object when nothing changed.
export function stepIndicator(indicator: Indicator, isWaiting: boolean, now: number): Indicator {
  const wait = nextWait(indicator.wait, isWaiting, now)
  const look = nextLook({ ...indicator, wait }, now)
  if (wait === indicator.wait && look === indicator.look) {
    return indicator
  }
  return { look, lookSince: look === indicator.look ? indicator.lookSince : now, wait }
}

function isOngoing(wait: Wait | null): wait is Wait {
  return wait?.until === null
}

// A wait begins when the view starts waiting (again), and ends when it stops.
function nextWait(wait: Wait | null, isWaiting: boolean, now: number): Wait | null {
  if (isWaiting) {
    return isOngoing(wait) ? wait : { since: now, until: null }
  }
  return isOngoing(wait) ? { since: wait.since, until: now } : wait
}

// Hidden, it appears once the wait has lasted; shown or leaving, a wait keeps it, and without one
// it goes after its time.
function nextLook({ look, lookSince, wait }: Indicator, now: number): IndicatorLook {
  if (look === IndicatorLook.Hidden) {
    return hasWaitedEnough(wait, now) ? IndicatorLook.Shown : look
  }
  if (isOngoing(wait)) {
    return IndicatorLook.Shown
  }
  return now - lookSince >= stayOf(look) ? leave(look) : look
}

function hasWaitedEnough(wait: Wait | null, now: number): boolean {
  return isOngoing(wait) && now - wait.since >= SHOW_DELAY_MS
}

function stayOf(look: IndicatorLook): number {
  return look === IndicatorLook.Shown ? MIN_SHOWN_MS : FADE_MS
}

function leave(look: IndicatorLook): IndicatorLook {
  return look === IndicatorLook.Shown ? IndicatorLook.Leaving : IndicatorLook.Hidden
}

// When the indicator changes on its own (it appears, begins to fade out, or is gone): the time to
// step it again; null when only a change of the wait can change it.
export function nextChangeAt({ look, lookSince, wait }: Indicator): number | null {
  if (look === IndicatorLook.Hidden) {
    return isOngoing(wait) ? wait.since + SHOW_DELAY_MS : null
  }
  return isOngoing(wait) ? null : lookSince + stayOf(look)
}

// How long the view has waited: until now while it waits, until the end once it ended.
export function waitedMs(wait: Wait | null, now: number): number {
  return wait === null ? 0 : Math.max((wait.until ?? now) - wait.since, 0)
}

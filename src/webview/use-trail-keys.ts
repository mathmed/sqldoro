import { useEffect } from 'react'

import type { Crumb } from '../core/navigation/history.ts'
import { WebviewMessageType } from '../core/results/protocol.ts'
import type { ResultsApi } from './results-api.ts'

const STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowLeft', -1],
  ['ArrowRight', 1],
])

// The step of the trail `offset` steps from the one shown; undefined past either end.
export function stepAt(crumbs: readonly Crumb[], offset: number): Crumb | undefined {
  const current = crumbs.findIndex((crumb) => crumb.isCurrent)
  const index = current + offset
  return current === -1 || index < 0 ? undefined : crumbs.at(index)
}

export function goToStep(api: ResultsApi, crumb: Crumb | undefined): void {
  if (crumb !== undefined) {
    api.postMessage({ type: WebviewMessageType.GoToStep, step: crumb.id })
  }
}

// In a field the arrows move the caret: Alt+Left there moves by words.
function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement
}

// Alt+Left and Alt+Right go back and forward along the trail of a table panel, as in a browser.
export function useTrailKeys(api: ResultsApi, crumbs: readonly Crumb[]): void {
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const offset = event.altKey && !isTyping(event.target) ? STEPS.get(event.key) : undefined
      if (offset !== undefined) {
        event.preventDefault()
        goToStep(api, stepAt(crumbs, offset))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [api, crumbs])
}

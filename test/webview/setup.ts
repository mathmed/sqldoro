import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom lays nothing out, so every element would measure 0×0 and the virtualized grid would show no
// rows: each element gets the size of a webview panel instead, as a browser would measure it.
const PANEL_WIDTH = 800
const PANEL_HEIGHT = 600

for (const [name, size] of [
  ['offsetWidth', PANEL_WIDTH],
  ['clientWidth', PANEL_WIDTH],
  ['offsetHeight', PANEL_HEIGHT],
  ['clientHeight', PANEL_HEIGHT],
] as const) {
  Object.defineProperty(HTMLElement.prototype, name, { configurable: true, get: () => size })
}

// jsdom cannot scroll an element either: scrolling is accepted and does nothing (tests spy on it).
Object.defineProperty(HTMLElement.prototype, 'scrollTo', {
  configurable: true,
  writable: true,
  value: (): void => undefined,
})

// Each test starts with an empty page.
afterEach(() => {
  cleanup()
})

// The stylesheets of the result view, in the order main.tsx loads them. jsdom lays nothing out but
// resolves the cascade, so a test can load them into the page and read what each element gets.
import base from '../../src/webview/base.css?raw'
import panels from '../../src/webview/panels.css?raw'
import queryBox from '../../src/webview/query-box.css?raw'
import styles from '../../src/webview/styles.css?raw'

const STYLESHEETS: readonly string[] = [base, styles, panels, queryBox]

// Loads them into the page; the function it returns takes them out again (a teardown of Vitest).
export function loadStylesheets(): () => void {
  const elements = STYLESHEETS.map((css) => {
    const element = document.createElement('style')
    element.textContent = css
    return element
  })
  document.head.append(...elements)
  return () => {
    for (const element of elements) {
      element.remove()
    }
  }
}

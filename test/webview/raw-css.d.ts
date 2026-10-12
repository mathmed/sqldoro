// A stylesheet imported as text, for the tests that load it into the page (vitest.config.ts).
declare module '*.css?raw' {
  const css: string
  export default css
}

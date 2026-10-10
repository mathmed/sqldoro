// Mutation testing (make mutation, make mutation-changed). Scope: the core, where the engine
// interface and the safety guards live. Drivers, the extension host and the webview are covered by
// unit, integration and smoke tests and are not worth the cost of mutating.
//
// Test runner: Stryker's vitest runner cannot select tests on Vitest 5 yet (its per-test name filter
// matches nothing, so every covered mutant "survives": stryker-mutator/stryker-js#6210). Until that
// fix ships, the command runner activates each mutant through an environment variable and runs the
// unit tests in a fresh Vitest process: slower, but every result is real.
//
// Each mutant runs the tests of the core only: the mutants live there, and the core is tested on its
// own. The tests of the other layers open real SSH sessions and would make every run several times
// slower; leaving them out can only make a mutant harder to kill, never easier.

/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
export default {
  mutate: ['src/core/**/*.ts', '!src/**/*.test.ts'],
  testRunner: 'command',
  commandRunner: { command: 'npx vitest run --bail=1 --no-isolate --maxWorkers=1 src/core' },
  coverageAnalysis: 'off',
  checkers: ['typescript'],
  tsconfigFile: 'tsconfig.core.json',
  ignorePatterns: ['dist', 'coverage', '.vscode-test', 'quality-fragments'],
  reporters: ['clear-text', 'progress', 'html', 'json'],
  htmlReporter: { fileName: 'reports/mutation/mutation.html' },
  jsonReporter: { fileName: 'reports/mutation/mutation.json' },
  thresholds: { high: 100, low: 95, break: null },
}

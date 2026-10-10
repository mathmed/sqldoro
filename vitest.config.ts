import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['{src,scripts,test}/**/*.test.ts'],
    setupFiles: ['test/setup.ts'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'scripts/**/*.ts'],
      // scripts/*.ts are the CLI entry points: they only hand argv to the tested modules below them
      // and run for real in CI (build, smoke, mutation and the Quality Report).
      exclude: ['**/*.test.ts', 'scripts/*.ts'],
      reporter: ['text', 'text-summary', 'html', 'json-summary'],
      // A ratchet: whenever coverage goes up, Vitest raises these numbers in this file (commit the
      // change). They never go down without the owner's approval.
      thresholds: {
        autoUpdate: (newThreshold) => Math.floor(newThreshold),
        statements: 100,
        branches: 100,
        functions: 100,
        lines: 100,
      },
    },
  },
})

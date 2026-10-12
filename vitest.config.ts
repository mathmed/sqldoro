import { configDefaults, defineConfig } from 'vitest/config'

const SHARED = {
  restoreMocks: true,
  unstubEnvs: true,
  unstubGlobals: true,
}

export default defineConfig({
  test: {
    // Two environments: Node.js for the core, the drivers, the extension host and the scripts; a
    // browser (jsdom) for the result webview.
    projects: [
      {
        test: {
          ...SHARED,
          name: 'node',
          include: ['{src,scripts,test}/**/*.test.ts'],
          // Integration tests need real servers: vitest.integration.config.ts runs them.
          exclude: [...configDefaults.exclude, '**/*.integration.test.ts', 'src/webview/**'],
          setupFiles: ['test/setup.ts'],
        },
      },
      {
        test: {
          ...SHARED,
          name: 'webview',
          environment: 'jsdom',
          include: ['src/webview/**/*.test.{ts,tsx}'],
          setupFiles: ['test/webview/setup.ts'],
          // A stylesheet imported as text (`?raw`) keeps its rules, so that a test can load it into
          // the page and check which of them win; the plain imports stay empty, as by default.
          css: { include: [/\.css\?raw$/] },
        },
      },
    ],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'scripts/**/*.ts'],
      // scripts/*.ts are the CLI entry points: they only hand argv to the tested modules below them
      // and run for real in CI (build, smoke, mutation and the Quality Report).
      exclude: ['**/*.test.{ts,tsx}', 'scripts/*.ts'],
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

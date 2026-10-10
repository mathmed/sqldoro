import { defineConfig } from 'vitest/config'

// Integration tests against real MySQL, PostgreSQL and SSH servers (make integration, or the
// `integration` CI job): test/integration/compose.yaml starts them. They are not part of `make test`,
// whose coverage the unit tests reach on their own.
export default defineConfig({
  test: {
    include: ['{src,test}/**/*.integration.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 120_000,
    restoreMocks: true,
  },
})

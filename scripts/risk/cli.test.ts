import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { main } from './cli.ts'

describe('risk command line', () => {
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('should pass a PR with exactly one known risk label', () => {
    const sut = main(['check', '--labels-json', '["dependencies","risk:low"]'])

    expect(sut).toBe(0)
    expect(log).toHaveBeenCalledWith('Risk label check passed.')
  })

  it('should fail a PR without a risk label', () => {
    const sut = main(['check', '--labels-json', '["dependencies"]'])

    expect(sut).toBe(1)
    expect(error).toHaveBeenCalledWith(
      'Risk label check failed: expected exactly one risk label (risk:low, risk:medium, risk:high, risk:critical), found: none.',
    )
  })

  it('should fail with a readable message on labels that are not a list of names', () => {
    expect(main(['check', '--labels-json', '{}'])).toBe(1)
    expect(error).toHaveBeenCalledWith(
      'Risk label check failed: --labels-json must be a JSON list of strings, got: {}',
    )
  })

  it('should not hide an unexpected failure', () => {
    expect(() => main(['check', '--labels-json', '[1'])).toThrow(SyntaxError)
  })

  it.each([[['floor']], [['check']], [[]]])('should explain the usage for %j', (argv) => {
    expect(main(argv)).toBe(2)
    expect(error).toHaveBeenCalledWith(expect.stringContaining('usage:'))
  })
})

import { beforeEach, describe, expect, it, type MockInstance, vi } from 'vitest'

import { main } from './cli.ts'

describe('pr-labels command line', () => {
  let log: MockInstance<typeof console.log>
  let error: MockInstance<typeof console.error>

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('should pass a PR with exactly one known risk label and one known deploy label', () => {
    const sut = main(['check', '--labels-json', '["dependencies","risk:low","deploy:none"]'])

    expect(sut).toBe(0)
    expect(log).toHaveBeenCalledWith('PR labels are set: one risk label and one deploy label.')
  })

  it('should fail a PR without a deploy label, naming the group', () => {
    const sut = main(['check', '--labels-json', '["risk:low"]'])

    expect(sut).toBe(1)
    expect(error).toHaveBeenCalledWith(
      'PR label check failed: expected exactly one deploy label (deploy:none, deploy:simple, deploy:migration, deploy:coordinated), found: none.',
    )
  })

  it('should report every group that fails', () => {
    expect(main(['check', '--labels-json', '[]'])).toBe(1)
    expect(error).toHaveBeenCalledTimes(2)
  })

  it('should fail with a readable message on labels that are not a list of names', () => {
    expect(main(['check', '--labels-json', '{}'])).toBe(1)
    expect(error).toHaveBeenCalledWith(
      'PR label check failed: --labels-json must be a JSON list of strings, got: {}',
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

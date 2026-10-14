import { describe, expect, it } from 'vitest'

import { Bump, isBump, nextVersion } from './next-version.ts'

describe('isBump', () => {
  it('should take the parts of a version that can be raised', () => {
    expect(['patch', 'minor', 'major'].every(isBump)).toBe(true)
    expect(isBump('build')).toBe(false)
  })
})

describe('nextVersion', () => {
  it('should raise one part of the version and reset the ones after it', () => {
    expect(nextVersion('1.4.9', Bump.Patch, '')).toStrictEqual({
      isValid: true,
      version: '1.4.10',
    })
    expect(nextVersion('1.4.9', Bump.Minor, '')).toStrictEqual({ isValid: true, version: '1.5.0' })
    expect(nextVersion('1.4.9', Bump.Major, '')).toStrictEqual({ isValid: true, version: '2.0.0' })
  })

  it('should take the exact version asked for instead of the bump', () => {
    expect(nextVersion('0.1.2', Bump.Major, '0.3.0')).toStrictEqual({
      isValid: true,
      version: '0.3.0',
    })
    expect(nextVersion('0.1.2', Bump.Patch, '0.1.3')).toMatchObject({ version: '0.1.3' })
    expect(nextVersion('0.1.2', Bump.Patch, '1.0.0')).toMatchObject({ version: '1.0.0' })
  })

  it('should release a version after its own pre-release', () => {
    expect(nextVersion('1.0.0-rc.1', Bump.Patch, '1.0.0')).toStrictEqual({
      isValid: true,
      version: '1.0.0',
    })
  })

  it('should refuse a version that does not come after the current one', () => {
    for (const requested of ['0.1.2', '0.1.1', '0.0.9', '0.0.10']) {
      expect(nextVersion('0.1.2', Bump.Patch, requested)).toStrictEqual({
        isValid: false,
        problem: `${requested} does not come after 0.1.2, the version of package.json`,
      })
    }
    expect(nextVersion('1.0.0-rc.1', Bump.Patch, '0.9.0').isValid).toBe(false)
  })

  it('should refuse a requested version that is not X.Y.Z', () => {
    for (const requested of ['v0.2.0', '0.2', '0.2.0-rc.1', '0.2.0\n']) {
      expect(nextVersion('0.1.2', Bump.Patch, requested)).toStrictEqual({
        isValid: false,
        problem: `"${requested}" is not a version such as 1.2.3`,
      })
    }
  })

  it('should ask for the exact version when the current one is a pre-release', () => {
    expect(nextVersion('1.0.0-rc.1', Bump.Patch, '')).toStrictEqual({
      isValid: false,
      problem: 'package.json holds 1.0.0-rc.1: give the exact version to release',
    })
  })
})

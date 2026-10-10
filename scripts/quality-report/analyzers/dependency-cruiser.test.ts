import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeDependencyCruiser } from './dependency-cruiser.ts'

const VIOLATIONS = `
> depcruise src scripts test

  error core-is-platform-agnostic: src/core/bad.ts → vscode
  error core-is-platform-agnostic: src/core/bad.ts → path
  error no-circular: src/core/x.ts →
      src/core/y.ts →
      src/core/x.ts
  error drivers-are-independent: src/drivers/mysql/a.ts → src/drivers/postgres/b.ts

x 4 dependency violations (4 errors, 0 warnings). 19 modules, 23 dependencies cruised.
`

function cruise(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.DependencyCruiser, exitCode, output, seconds: 1 }
}

describe('analyzeDependencyCruiser', () => {
  it('should be ok when every contract is kept', () => {
    const output = '✔ no dependency violations found (8 modules, 10 dependencies cruised)'

    expect(analyzeDependencyCruiser(cruise(output, 0))).toStrictEqual({
      status: Status.Ok,
      summary: 'All contracts kept (8 modules, 10 dependencies cruised)',
    })
  })

  it('should not need the module count to be ok', () => {
    expect(analyzeDependencyCruiser(cruise('', 0)).summary).toBe('All contracts kept')
  })

  it('should name the broken contracts and keep the violating imports', () => {
    const sut = analyzeDependencyCruiser(cruise(VIOLATIONS, 4))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe(
      '4 violations of **core-is-platform-agnostic**, **drivers-are-independent**, **no-circular**',
    )
    expect(sut.details?.title).toBe('Broken contracts and violating imports')
    expect(sut.details?.body).toContain(
      '  error core-is-platform-agnostic: src/core/bad.ts → vscode',
    )
    expect(sut.details?.body).toContain('      src/core/y.ts →')
  })

  it('should fail without violations when dependency-cruiser crashes', () => {
    const sut = analyzeDependencyCruiser(cruise('ERROR: invalid configuration', 1))

    expect(sut.summary).toBe('dependency-cruiser failed before checking the contracts')
    expect(sut.details?.body).toBe('ERROR: invalid configuration')
  })
})

import { describe, expect, it } from 'vitest'

import { Analysis } from '../analysis.ts'
import type { Fragment } from '../fragment.ts'
import { Status } from '../status.ts'
import { analyzeSmoke } from './smoke.ts'

const PASSED = `>> launching VS Code stable with the extension under development
✔ Validated version: 1.141.0
[main 2026-10-10T01:27:42.568Z] update#ctor - updates are disabled by the environment
>> VS Code 1.141.0
>> extension mathmed.sqldoro activated in 0.194s
>> contributed commands registered: 12
>> contributed views registered: 1
>> sqldoro.hello -> Hello from sqldoro (development)!
>> result view loaded in 0.812s
>> smoke OK`

function smoke(output: string, exitCode: number): Fragment {
  return { analysis: Analysis.Smoke, exitCode, output, seconds: 30 }
}

describe('analyzeSmoke', () => {
  it('should report the activation time, VS Code version, commands and the result view', () => {
    expect(analyzeSmoke(smoke(PASSED, 0))).toStrictEqual({
      status: Status.Ok,
      summary:
        'Activated in 0.194s on VS Code 1.141.0 · 12 contributed commands and 1 contributed view registered · result view loaded in 0.812s',
    })
  })

  it('should report the result view without the registrations', () => {
    const output = '>> VS Code 1.141.0\n>> result view loaded in 1.5s\n>> smoke OK'

    expect(analyzeSmoke(smoke(output, 0)).summary).toBe(
      'Activated on VS Code 1.141.0 · result view loaded in 1.5s',
    )
  })

  it('should report the commands alone when the views are not reported', () => {
    const output = '>> VS Code 1.141.0\n>> contributed commands registered: 1\n>> smoke OK'

    expect(analyzeSmoke(smoke(output, 0)).summary).toBe(
      'Activated on VS Code 1.141.0 · 1 contributed command registered',
    )
  })

  it('should not need the suite lines to be ok', () => {
    expect(analyzeSmoke(smoke('>> smoke OK', 0)).summary).toBe('Activated')
  })

  it('should explain a failed check after the activation', () => {
    const output = [
      '>> VS Code 1.141.0',
      '>> extension mathmed.sqldoro activated in 0.2s',
      '>> smoke: contributed commands not registered after activation: sqldoro.hello',
      'Error: contributed commands not registered after activation',
      '>> smoke FAILED: Test run failed with code 1',
    ].join('\n')

    const sut = analyzeSmoke(smoke(output, 1))

    expect(sut.status).toBe(Status.Failed)
    expect(sut.summary).toBe(
      'Extension activated but a check failed: contributed commands not registered after activation: sqldoro.hello',
    )
    expect(sut.details?.body).not.toContain('Error: contributed')
  })

  it('should explain an extension that did not activate', () => {
    const output = '>> VS Code 1.141.0\n>> smoke: Cannot find module dist/extension.cjs'

    expect(analyzeSmoke(smoke(output, 1)).summary).toBe(
      'Extension did not activate: Cannot find module dist/extension.cjs',
    )
  })

  it('should explain a VS Code that never ran the suite', () => {
    const output =
      '>> launching VS Code stable\n>> smoke FAILED: getaddrinfo ENOTFOUND update.code.visualstudio.com'

    expect(analyzeSmoke(smoke(output, 1)).summary).toBe(
      'VS Code did not run the smoke suite: getaddrinfo ENOTFOUND update.code.visualstudio.com',
    )
  })

  it('should keep the raw log when nothing was reported', () => {
    const sut = analyzeSmoke(smoke('Segmentation fault', 139))

    expect(sut.summary).toBe('VS Code did not run the smoke suite: no reason reported')
    expect(sut.details?.body).toBe('Segmentation fault')
  })
})

import { describe, expect, it } from 'vitest'

import { auditReport } from './npm.ts'

const NODE = process.execPath

describe('auditReport', () => {
  it('should return what the command prints, even when it exits with vulnerabilities found', async () => {
    const script = 'console.log(JSON.stringify({ auditReportVersion: 2 })); process.exitCode = 1'

    expect(await auditReport([NODE, '-e', script])).toBe('{"auditReportVersion":2}\n')
  })

  it('should fail when the command does not exist', async () => {
    await expect(auditReport(['no-such-binary-xyz'])).rejects.toThrow(
      'could not run no-such-binary-xyz:',
    )
  })

  it('should fail when the command is stopped by a signal', async () => {
    const script = 'process.kill(process.pid, "SIGTERM")'

    await expect(auditReport([NODE, '-e', script])).rejects.toThrow(`could not run ${NODE}:`)
  })
})

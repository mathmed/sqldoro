import { describe, expect, it } from 'vitest'

import { Status, worst } from './status.ts'

describe('worst', () => {
  it('should be ok when there is nothing to judge', () => {
    expect(worst([])).toBe(Status.Ok)
  })

  it.each([
    [[Status.Ok, Status.Skipped], Status.Skipped],
    [[Status.Warning, Status.Skipped, Status.Ok], Status.Warning],
    [[Status.Ok, Status.Failed, Status.Warning], Status.Failed],
    [[Status.Failed, Status.Ok], Status.Failed],
  ])('should rank %j as %s', (statuses, expected) => {
    expect(worst(statuses)).toBe(expected)
  })
})

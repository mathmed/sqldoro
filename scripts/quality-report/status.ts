export const Status = {
  Ok: '✅',
  Skipped: '⏭️',
  Warning: '⚠️',
  Failed: '❌',
} as const

export type Status = (typeof Status)[keyof typeof Status]

const SEVERITY: readonly Status[] = [Status.Ok, Status.Skipped, Status.Warning, Status.Failed]

export function worst(statuses: readonly Status[]): Status {
  return statuses.reduce(
    (current, status) => (SEVERITY.indexOf(status) > SEVERITY.indexOf(current) ? status : current),
    Status.Ok,
  )
}

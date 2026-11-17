export interface AuditException {
  readonly id: string
  readonly packageName: string
  // The vulnerable range npm audit reports: once a fixed release is out, the advisory's range changes
  // and the exception stops matching.
  readonly range: string
  // YYYY-MM-DD, UTC.
  readonly created: string
  readonly expires: string
}

// Temporary exception the owner (Mateus) approved once, on 2026-11-17: GHSA-fc5q-39xc-vjpf (picomatch
// ReDoS, <=4.0.7) has no fixed release and only reaches dev tools (typescript-eslint,
// dependency-cruiser, knip, vite, vitest, vsce), none of them in the .vsix. It expires on 2026-12-17;
// delete it as soon as picomatch publishes a fix (the audit fails then until it is deleted).
export const AUDIT_EXCEPTIONS: readonly AuditException[] = [
  {
    id: 'GHSA-fc5q-39xc-vjpf',
    packageName: 'picomatch',
    range: '<=4.0.7',
    created: '2026-11-17',
    expires: '2026-12-17',
  },
]

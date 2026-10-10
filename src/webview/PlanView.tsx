import type { ReactElement } from 'react'

// The plan EXPLAIN gave, line by line, as the server wrote it.
export const PlanView = ({ lines }: { readonly lines: readonly string[] }): ReactElement => (
  <pre className="plan" aria-label="Query plan" tabIndex={0}>
    {lines.join('\n')}
  </pre>
)

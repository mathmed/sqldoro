import type { ReactElement } from 'react'

import { tabOutcomeText } from '../core/results/outcome.ts'
import type { ResultTab } from '../core/results/protocol.ts'
import { lexicalOf, type SqlDialect } from './where-source.ts'

interface OutcomeViewProps {
  readonly tab: ResultTab
  readonly sql: SqlDialect | null
}

// What a statement without a result set did, in place of an empty grid: "UPDATE: 3 rows affected ·
// 12 ms", what it notes, and the statement itself.
export const OutcomeView = ({ tab, sql }: OutcomeViewProps): ReactElement => (
  <div className="outcome">
    <p className="outcome-text" role="status">
      {tabOutcomeText(tab, lexicalOf(sql))}
    </p>
    {tab.notice === '' ? null : <p className="outcome-notice">{tab.notice}</p>}
    <code className="outcome-sql" title={tab.sql}>
      {tab.title}
    </code>
  </div>
)

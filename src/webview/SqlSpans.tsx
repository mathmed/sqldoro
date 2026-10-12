import type { ReactElement } from 'react'

import { highlightSql } from '../core/sql/highlight.ts'
import type { WhereSql } from './where-source.ts'

// The text of a field of SQL in colors, part by part, as the SQL of the connection is written.
export const SqlSpans = ({
  text,
  sql,
}: {
  readonly text: string
  readonly sql: WhereSql
}): ReactElement[] =>
  highlightSql(text, sql.source.dialect.lexical, sql.keywords).map((span, index) => (
    // The parts of the text come in its order, and are drawn anew with it.
    // eslint-disable-next-line @eslint-react/no-array-index-key -- a part has nothing else to be told apart by
    <span key={index} className={`sql-${span.kind}`}>
      {span.text}
    </span>
  ))

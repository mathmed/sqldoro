import { type Dialect, quoteIdentifier } from '../engine/dialect.ts'
import type { QueryValue } from '../engine/query.ts'
import type { Binder } from '../results/binders.ts'
import { isPlainNumber } from '../results/literals.ts'

// A column of a key and the value it must hold: never NULL, since a key with a NULL points at
// nothing.
export interface KeyPart {
  readonly column: string
  readonly value: boolean | number | string
}

// The rows a navigation leads to: those whose columns hold these values. A row key (the key a
// foreign key points at) names one row; the columns of a foreign key pointing back name the rows
// that reference one.
export interface KeyMatch {
  readonly parts: readonly KeyPart[]
  readonly isRowKey: boolean
}

export interface KeyWriting {
  readonly dialect: Pick<Dialect, 'identifierQuote'>
  readonly binder: Binder
  // The type the server compares each column's values as, by column name, where the catalog says.
  readonly parameterTypes: ReadonlyMap<string, string>
}

// Values longer than this are cut where people read them (breadcrumbs, titles).
const MAX_SHOWN_VALUE = 40
const ELLIPSIS = '…'
const SEPARATOR = ', '

// One condition per column of the key: column = value, every value given to the binder.
export function keyConditions(key: KeyMatch, writing: KeyWriting): string[] {
  return key.parts.map(({ column, value }) => {
    const bound = writing.binder.bind(value, writing.parameterTypes.get(column) ?? '')
    return `${quoteIdentifier(writing.dialect, column)} = ${bound}`
  })
}

// "#1" (or "#1, 2" for a key of two columns) names a row; "(condominiumId = 1)" the rows that
// reference one.
export function keyText(key: KeyMatch): string {
  if (key.isRowKey) {
    return `#${key.parts.map(({ value }) => shownValue(value)).join(SEPARATOR)}`
  }
  const pairs = key.parts.map(({ column, value }) => `${column} = ${quotedValue(value)}`)
  return `(${pairs.join(SEPARATOR)})`
}

function shownValue(value: QueryValue): string {
  const text = String(value)
  return text.length > MAX_SHOWN_VALUE ? `${text.slice(0, MAX_SHOWN_VALUE - 1)}${ELLIPSIS}` : text
}

// Numbers and booleans as they are, any other text quoted.
function quotedValue(value: QueryValue): string {
  return typeof value === 'string' && !isPlainNumber(value)
    ? `'${shownValue(value)}'`
    : shownValue(value)
}

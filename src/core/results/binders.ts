import { type Dialect, parameterPlaceholder } from '../engine/dialect.ts'
import type { QueryValue } from '../engine/query.ts'
import { isPlainNumber, stringLiteral } from './literals.ts'

// How a value given by the user goes into a statement sqldoro writes: a bound parameter for what
// runs, or a literal for the text of a statement the user reads and runs in an editor.
export interface Binder {
  // What stands for the value in the statement. The parameter type, when not empty, is the type the
  // server compares the value as (CAST(? AS SIGNED)).
  readonly bind: (value: QueryValue, parameterType: string) => string
  // The bound values, in the order of their placeholders.
  readonly values: () => readonly QueryValue[]
}

// Placeholders numbered from `first`: the statement may bind values before these.
export function parameterBinder(dialect: Pick<Dialect, 'parameterStyle'>, first: number): Binder {
  const values: QueryValue[] = []
  return {
    bind: (value, parameterType) => {
      const placeholder = parameterPlaceholder(dialect, first + values.length)
      values.push(value)
      return parameterType === '' ? placeholder : `CAST(${placeholder} AS ${parameterType})`
    },
    values: () => values,
  }
}

// Literals, for a statement shown to the user: numbers stay numbers where the column compares
// numbers, anything else is a string the server reads in the type of the column.
export function literalBinder(dialect: Pick<Dialect, 'lexical'>): Binder {
  return {
    bind: (value, parameterType) => literalOf(value, { parameterType, dialect }),
    values: () => [],
  }
}

interface Writing {
  readonly parameterType: string
  readonly dialect: Pick<Dialect, 'lexical'>
}

function literalOf(value: QueryValue, writing: Writing): string {
  if (typeof value === 'string') {
    return textLiteral(value, writing)
  }
  // NULL, TRUE, FALSE and numbers as they are.
  return String(value).toUpperCase()
}

function textLiteral(value: string, { parameterType, dialect }: Writing): string {
  return parameterType !== '' && isPlainNumber(value) ? value : stringLiteral(value, dialect)
}

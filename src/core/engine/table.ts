import type { ObjectRef } from './catalog.ts'

// What a name in a FROM clause turned out to be.
export const RelationKind = {
  Table: 'table',
  View: 'view',
  MaterializedView: 'materializedView',
  ForeignTable: 'foreignTable',
  Other: 'other',
} as const

export type RelationKind = (typeof RelationKind)[keyof typeof RelationKind]

// How the values of a column are typed in the grid and checked before sqldoro writes them.
export const ValueType = {
  Integer: 'integer',
  Decimal: 'decimal',
  Float: 'float',
  Boolean: 'boolean',
  Text: 'text',
  Date: 'date',
  Time: 'time',
  Timestamp: 'timestamp',
  // MySQL's YEAR: 1901 to 2155, or 0000.
  Year: 'year',
  Json: 'json',
  // One of a list (ENUM), or a comma-separated set of them (MySQL's SET).
  Choice: 'choice',
  Uuid: 'uuid',
  // Any text: the server checks it with its own strict rules (PostgreSQL types sqldoro has no
  // checker for, such as arrays, intervals or network addresses).
  Server: 'server',
  ReadOnly: 'readOnly',
} as const

export type ValueType = (typeof ValueType)[keyof typeof ValueType]

// The years a date or a timestamp column takes, both included.
interface YearRange {
  readonly minYear: number
  readonly maxYear: number
}

export type ValueSpec =
  // The smallest and the largest value, as exact decimal text.
  | { readonly type: typeof ValueType.Integer; readonly min: string; readonly max: string }
  // Digits in all and after the point; a precision of 0 has no limit.
  | { readonly type: typeof ValueType.Decimal; readonly precision: number; readonly scale: number }
  | { readonly type: typeof ValueType.Float }
  | { readonly type: typeof ValueType.Boolean }
  // Characters; 0 has no limit.
  | { readonly type: typeof ValueType.Text; readonly maxLength: number }
  | ({ readonly type: typeof ValueType.Date } & YearRange)
  | {
      readonly type: typeof ValueType.Time
      // Digits after the second, and the largest hour (MySQL's TIME holds durations).
      readonly fraction: number
      readonly maxHour: number
      // The value needs its UTC offset: without it the server would read it in its own zone.
      readonly hasTimeZone: boolean
    }
  | ({
      readonly type: typeof ValueType.Timestamp
      readonly fraction: number
      readonly hasTimeZone: boolean
    } & YearRange)
  | { readonly type: typeof ValueType.Year }
  | { readonly type: typeof ValueType.Json }
  | {
      readonly type: typeof ValueType.Choice
      readonly options: readonly string[]
      readonly isMultiple: boolean
    }
  | { readonly type: typeof ValueType.Uuid }
  | { readonly type: typeof ValueType.Server }
  // Why the grid shows the values without letting them be changed, for people.
  | { readonly type: typeof ValueType.ReadOnly; readonly reason: string }

// How statements write and compare the values of a column: SQL the driver declares for the type of
// the column, never anything a user typed.
export interface ValueSql {
  // The type a bound value is cast to, CAST(? AS SIGNED): MySQL would compare a number with text as
  // floating-point numbers. Empty: the value goes as it is.
  readonly parameterType: string
  // The type the column is compared as when sqldoro checks that it still holds what it held (JSON
  // as text). Empty: the column itself.
  readonly comparedAs: string
  // The collation text is compared in, so that a change of case counts (MySQL). Empty: the column's.
  readonly collation: string
}

export interface TableColumn {
  readonly name: string
  // How result columns refer to it: ColumnOrigin.column.
  readonly reference: string
  readonly dataType: string
  readonly isNullable: boolean
  // Whether an INSERT can leave it out: a default, an identity, a sequence, AUTO_INCREMENT or a
  // generated value.
  readonly hasDefault: boolean
  // Generated columns, and identities that refuse values, are only written by the server.
  readonly isWritable: boolean
  readonly value: ValueSpec
  readonly sql: ValueSql
}

// What editing the rows of a table needs to know about it.
export interface TableDescription {
  // Where the table is: the qualified name statements write to is its schema and name.
  readonly ref: ObjectRef
  readonly kind: RelationKind
  // Why sqldoro does not edit this table whatever the query (a storage engine that cannot roll
  // back, child tables whose rows show too), for people; empty when it can.
  readonly problem: string
  readonly columns: readonly TableColumn[]
  // The keys that tell its rows apart: the primary key first, then the unique keys made only of
  // columns that refuse NULL (no expression, no partial index). Column names, in key order.
  readonly keys: readonly (readonly string[])[]
}

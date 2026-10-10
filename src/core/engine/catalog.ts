export interface DatabaseInfo {
  readonly name: string
}

export interface SchemaInfo {
  readonly name: string
}

// The namespace that holds tables: a schema in PostgreSQL, the database itself in MySQL.
export interface ObjectScope {
  readonly database: string
  readonly schema: string
}

export interface ObjectRef extends ObjectScope {
  readonly name: string
}

export interface TableInfo {
  readonly name: string
}

export interface ViewInfo {
  readonly name: string
  readonly isMaterialized: boolean
}

export interface ColumnInfo {
  readonly name: string
  readonly dataType: string
  readonly isNullable: boolean
  readonly defaultValue: string | undefined
  readonly isPrimaryKey: boolean
}

export interface IndexInfo {
  readonly name: string
  readonly columns: readonly string[]
  readonly isUnique: boolean
  readonly isPrimary: boolean
}

export interface ForeignKeyInfo {
  readonly name: string
  readonly columns: readonly string[]
  readonly referencedSchema: string
  readonly referencedTable: string
  readonly referencedColumns: readonly string[]
  readonly onUpdate: string
  readonly onDelete: string
}

// One row per column of an index, in index then key order, as the catalog queries return them.
export interface IndexColumn {
  readonly index: string
  readonly column: string
  readonly isUnique: boolean
  readonly isPrimary: boolean
}

// One row per column of a foreign key, in constraint then key order.
export interface ForeignKeyColumn {
  readonly constraint: string
  readonly column: string
  readonly referencedSchema: string
  readonly referencedTable: string
  readonly referencedColumn: string
  readonly onUpdate: string
  readonly onDelete: string
}

export function groupIndexColumns(rows: readonly IndexColumn[]): IndexInfo[] {
  const indexes = new Map<string, IndexInfo>()
  for (const row of rows) {
    const index = indexes.get(row.index)
    const columns = index === undefined ? [row.column] : [...index.columns, row.column]
    indexes.set(row.index, {
      name: row.index,
      columns,
      isUnique: row.isUnique,
      isPrimary: row.isPrimary,
    })
  }
  return [...indexes.values()]
}

export function groupForeignKeyColumns(rows: readonly ForeignKeyColumn[]): ForeignKeyInfo[] {
  const foreignKeys = new Map<string, ForeignKeyInfo>()
  for (const row of rows) {
    foreignKeys.set(row.constraint, addForeignKeyColumn(foreignKeys.get(row.constraint), row))
  }
  return [...foreignKeys.values()]
}

function addForeignKeyColumn(
  foreignKey: ForeignKeyInfo | undefined,
  row: ForeignKeyColumn,
): ForeignKeyInfo {
  return {
    name: row.constraint,
    columns: [...(foreignKey?.columns ?? []), row.column],
    referencedSchema: row.referencedSchema,
    referencedTable: row.referencedTable,
    referencedColumns: [...(foreignKey?.referencedColumns ?? []), row.referencedColumn],
    onUpdate: row.onUpdate,
    onDelete: row.onDelete,
  }
}

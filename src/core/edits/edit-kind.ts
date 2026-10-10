// What the grid asks of the changes: a value typed in cells, NULL or the default in them, their
// values reverted, every change reverted, a row added, rows duplicated or deleted.
export const EditKind = {
  Set: 'set',
  SetNull: 'setNull',
  SetDefault: 'setDefault',
  Revert: 'revert',
  RevertAll: 'revertAll',
  Insert: 'insert',
  Duplicate: 'duplicate',
  Delete: 'delete',
} as const

export type EditKind = (typeof EditKind)[keyof typeof EditKind]

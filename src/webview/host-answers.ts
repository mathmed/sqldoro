import {
  type CellMessage,
  type DistinctMessage,
  type HostMessage,
  HostMessageType,
  type PeekMessage,
  type ReferenceCountsMessage,
} from '../core/results/protocol.ts'

// The last answer of the host to each thing the view asks of it: the whole value of a cell, the row
// a link points at, the counts of the rows that reference a row, the values of a column.
export interface HostAnswers {
  readonly cell: CellMessage | undefined
  readonly peek: PeekMessage | undefined
  readonly counts: ReferenceCountsMessage | undefined
  readonly distinct: DistinctMessage | undefined
}

export const NO_ANSWERS: HostAnswers = {
  cell: undefined,
  peek: undefined,
  counts: undefined,
  distinct: undefined,
}

const KEYS: ReadonlyMap<string, keyof HostAnswers> = new Map<string, keyof HostAnswers>([
  [HostMessageType.Cell, 'cell'],
  [HostMessageType.Peek, 'peek'],
  [HostMessageType.ReferenceCounts, 'counts'],
  [HostMessageType.Distinct, 'distinct'],
])

// The answers with this message, when it is one; any other message leaves them as they are.
export function withAnswer(answers: HostAnswers, message: HostMessage): HostAnswers {
  const key = KEYS.get(message.type)
  return key === undefined ? answers : { ...answers, [key]: message }
}

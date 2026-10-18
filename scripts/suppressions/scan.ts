import { parse, type TSESTree } from '@typescript-eslint/typescript-estree'

import { compareText } from '../shared/text.ts'
import { COMMENT_RULES, kindOrder, mayHoldSuppressions, type SuppressionKind } from './kinds.ts'
import { type Marker, testMarkers } from './test-markers.ts'

export interface Occurrence {
  readonly path: string
  readonly line: number
  readonly kind: SuppressionKind
}

const JSX_EXTENSIONS: readonly string[] = ['.tsx', '.jsx']

// Comments come from the TypeScript parser, so the same text inside a string or a template does
// not count; the test markers come from its syntax tree.
export function scanSource(path: string, source: string): Occurrence[] {
  if (!mayHoldSuppressions(source)) {
    return []
  }
  const program = parse(source, {
    comment: true,
    loc: true,
    filePath: path,
    jsx: JSX_EXTENSIONS.some((extension) => path.endsWith(extension)),
  })
  return [...commentMarkers(program.comments), ...testMarkers(program)]
    .toSorted(byLineThenKind)
    .map(({ line, kind }) => ({ path, line, kind }))
}

function commentMarkers(comments: readonly TSESTree.Comment[]): Marker[] {
  return comments.flatMap((comment) =>
    COMMENT_RULES.flatMap(({ kind, pattern }) =>
      [...comment.value.matchAll(pattern)].map(() => ({ line: comment.loc.start.line, kind })),
    ),
  )
}

function byLineThenKind(left: Marker, right: Marker): number {
  const byLine = left.line - right.line
  return byLine === 0 ? kindOrder(left.kind) - kindOrder(right.kind) : byLine
}

export function compareOccurrences(left: Occurrence, right: Occurrence): number {
  const byPath = compareText(left.path, right.path)
  return byPath === 0 ? byLineThenKind(left, right) : byPath
}

import type { ReactElement } from 'react'

import { ColumnKind } from '../core/engine/query.ts'

interface KindShape {
  // What the kind is called, for the tooltip of the header.
  readonly name: string
  readonly glyph: ReactElement
}

// Text and binary values read best as short text (abc, 01); the other kinds are line drawings.
const TEXT = { fill: 'currentColor', stroke: 'none', textAnchor: 'middle' } as const

const OTHER: KindShape = { name: 'other', glyph: <path d="M8 2.5 13.5 8 8 13.5 2.5 8z" /> }
const SHAPES: ReadonlyMap<ColumnKind, KindShape> = new Map([
  [
    ColumnKind.Number,
    { name: 'number', glyph: <path d="M6.5 2.5 5 13.5M11 2.5 9.5 13.5M3 6h10.5M2.5 10H13" /> },
  ],
  [
    ColumnKind.Text,
    {
      name: 'text',
      glyph: (
        <text {...TEXT} x="8" y="11.5" fontSize="8.5" fontWeight="600">
          abc
        </text>
      ),
    },
  ],
  [
    ColumnKind.Boolean,
    {
      name: 'boolean',
      glyph: (
        <path d="M5.5 4.5h5a3.5 3.5 0 0 1 0 7h-5a3.5 3.5 0 0 1 0-7zM10.5 6.25a1.75 1.75 0 1 1 0 3.5 1.75 1.75 0 0 1 0-3.5z" />
      ),
    },
  ],
  [
    ColumnKind.Temporal,
    { name: 'date and time', glyph: <path d="M2.5 3.5h11v10h-11zM2.5 6.5h11M5.5 2v3M10.5 2v3" /> },
  ],
  [
    ColumnKind.Json,
    {
      name: 'JSON',
      glyph: (
        <path d="M6 2.5c-1.5 0-2 .5-2 2v1.75C4 7.15 3.4 8 2.5 8c.9 0 1.5.85 1.5 1.75v1.75c0 1.5.5 2 2 2M10 2.5c1.5 0 2 .5 2 2v1.75c0 .9.6 1.75 1.5 1.75-.9 0-1.5.85-1.5 1.75v1.75c0 1.5-.5 2-2 2" />
      ),
    },
  ],
  [
    ColumnKind.Binary,
    {
      name: 'binary',
      glyph: (
        <text {...TEXT} x="8" y="11.5" fontSize="8.5" fontWeight="600">
          01
        </text>
      ),
    },
  ],
  [ColumnKind.Other, OTHER],
])

// A kind sqldoro does not know yet is drawn as any other value.
function shapeOf(kind: ColumnKind): KindShape {
  return SHAPES.get(kind) ?? OTHER
}

export function kindName(kind: ColumnKind): string {
  return shapeOf(kind).name
}

// What a column holds, before its name in the header.
export const KindIcon = ({ kind }: { readonly kind: ColumnKind }): ReactElement => (
  <svg
    className={`kind-icon kind-${kind}`}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {shapeOf(kind).glyph}
  </svg>
)

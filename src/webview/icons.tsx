import type { ReactElement } from 'react'

// Line icons drawn in the color of the text around them, in the spirit of VS Code's codicons. Both
// webviews draw them inline: the page loads no font and no image.
export const IconName = {
  Back: 'back',
  Forward: 'forward',
  ArrowLink: 'arrowLink',
  Columns: 'columns',
  References: 'references',
  Expand: 'expand',
  Grip: 'grip',
  Link: 'link',
  Lock: 'lock',
  Unlock: 'unlock',
  Chevron: 'chevron',
  ChevronDown: 'chevronDown',
  Eye: 'eye',
  EyeClosed: 'eyeClosed',
  Refresh: 'refresh',
  Zap: 'zap',
  Sliders: 'sliders',
  Close: 'close',
  Stop: 'stop',
  LoadAll: 'loadAll',
  Save: 'save',
  Discard: 'discard',
  ClearAll: 'clearAll',
  Add: 'add',
  Duplicate: 'duplicate',
  Trash: 'trash',
  SetNull: 'setNull',
  SetDefault: 'setDefault',
  Copy: 'copy',
  Export: 'export',
  Server: 'server',
  Filter: 'filter',
  More: 'more',
  Search: 'search',
} as const

export type IconName = (typeof IconName)[keyof typeof IconName]

const SHAPES: ReadonlyMap<IconName, string> = new Map([
  [IconName.Back, 'M7.5 3.5 3 8l4.5 4.5M3.5 8H13'],
  [IconName.Forward, 'M8.5 3.5 13 8l-4.5 4.5M12.5 8H3'],
  [IconName.ArrowLink, 'M5.5 10.5 10.5 5.5M6.5 5.5h4v4'],
  [IconName.Columns, 'M2.5 3h11v10h-11zM6.5 3v10M10 3v10'],
  [IconName.References, 'M3 4.5h6M3 8h4M3 11.5h6M11 6.5l2.5 2-2.5 2M13.5 8.5H8'],
  [IconName.Expand, 'M9.5 2.5h4v4M13.5 2.5 9 7M6.5 13.5h-4v-4M2.5 13.5 7 9'],
  [IconName.Grip, 'M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01'],
  [
    IconName.Link,
    'M6.5 9.5l3-3M7.2 4.8l1.1-1.1a2.5 2.5 0 0 1 3.5 3.5l-1.1 1.1M8.8 11.2l-1.1 1.1a2.5 2.5 0 0 1-3.5-3.5l1.1-1.1',
  ],
  [IconName.Lock, 'M4 7.5h8v6H4zM5.75 7.5V5.25a2.25 2.25 0 0 1 4.5 0V7.5'],
  [IconName.Unlock, 'M4 7.5h8v6H4zM5.75 7.5V5.25a2.25 2.25 0 0 1 4.4-.65'],
  [IconName.Chevron, 'M6 3.5 10.5 8 6 12.5'],
  [IconName.ChevronDown, 'M4 6.5 8 10.5 12 6.5'],
  [
    IconName.Eye,
    'M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  ],
  [
    IconName.EyeClosed,
    'M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM2.5 2.5l11 11',
  ],
  [IconName.Refresh, 'M13 8a5 5 0 1 1-1.5-3.55M13 2.75v3h-3'],
  [IconName.Zap, 'M9 1.75 3.75 9H8l-1 5.25L12.25 7H8z'],
  [IconName.Sliders, 'M2.5 5h2m3 0h6m-11 6h6m3 0h2M6 3.5v3M10 9.5v3'],
  [IconName.Close, 'M4 4l8 8m0-8-8 8'],
  [IconName.Stop, 'M4.5 4.5h7v7h-7z'],
  [IconName.LoadAll, 'M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10'],
  [IconName.Save, 'M3 2.5h8l2.5 2.5v8.5H3zM5.5 2.5V6h4.5V2.5M5 13.5v-4h6v4'],
  [IconName.Discard, 'M5.5 3.5 3 6l2.5 2.5M3.5 6H10a3 3 0 0 1 0 6H6.5'],
  [IconName.ClearAll, 'M2.5 4h11M2.5 7.5h7M2.5 11h4.5M10 10l3 3m0-3-3 3'],
  [IconName.Add, 'M8 3v10M3 8h10'],
  [IconName.Duplicate, 'M5.5 5.5h7v7h-7zM10.5 5.5v-2h-7v7h2'],
  [IconName.Trash, 'M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9'],
  [IconName.SetNull, 'M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11zM4.1 11.9l7.8-7.8'],
  [IconName.SetDefault, 'M2.5 2.5h11v11h-11zM6 5h1.75a3 3 0 0 1 0 6H6z'],
  [IconName.Copy, 'M5.5 2.5h5v2h-5zM5.5 3.5H3.5v10h9v-10h-2'],
  [IconName.Export, 'M8 9.5v-7M5 5.5l3-3 3 3M3.5 9v4.5h9V9'],
  [IconName.Server, 'M2.5 3h11v4h-11zM2.5 9h11v4h-11zM5 5h.01M5 11h.01'],
  [IconName.Filter, 'M2.5 3.5h11l-4.25 5v4.25l-2.5-1.25v-3z'],
  [
    IconName.More,
    'M8 2.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM8 7.25a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5zM8 11.75a.75.75 0 1 1 0 1.5.75.75 0 0 1 0-1.5z',
  ],
  [IconName.Search, 'M7 2.5a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm3.25 7.75 3.25 3.25'],
])

export const Icon = ({ name }: { readonly name: IconName }): ReactElement => (
  <svg
    className={`icon icon-${name}`}
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.25"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <path d={SHAPES.get(name)} />
  </svg>
)

// A database: the glyph of every engine until each has its own.
export const DatabaseGlyph = (): ReactElement => (
  <svg
    className="database-glyph"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.4"
    strokeLinecap="round"
    aria-hidden="true"
    focusable="false"
  >
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.75" />
    <path d="M4.5 5.5v13c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75v-13" />
    <path d="M4.5 12c0 1.52 3.36 2.75 7.5 2.75s7.5-1.23 7.5-2.75" />
  </svg>
)

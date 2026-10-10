import type { ReactElement } from 'react'

// Line icons drawn in the color of the text around them, in the spirit of VS Code's codicons.
export const IconName = {
  Back: 'back',
  Link: 'link',
  Lock: 'lock',
  Unlock: 'unlock',
  Chevron: 'chevron',
  Eye: 'eye',
  EyeClosed: 'eyeClosed',
  Refresh: 'refresh',
  Zap: 'zap',
  Sliders: 'sliders',
  Close: 'close',
} as const

export type IconName = (typeof IconName)[keyof typeof IconName]

const SHAPES: ReadonlyMap<IconName, ReactElement> = new Map([
  [IconName.Back, <path key="back" d="M7.5 3.5 3 8l4.5 4.5M3.5 8H13" />],
  [
    IconName.Link,
    <path
      key="link"
      d="M6.5 9.5l3-3M7.2 4.8l1.1-1.1a2.5 2.5 0 0 1 3.5 3.5l-1.1 1.1M8.8 11.2l-1.1 1.1a2.5 2.5 0 0 1-3.5-3.5l1.1-1.1"
    />,
  ],
  [IconName.Lock, <path key="lock" d="M4 7.5h8v6H4zM5.75 7.5V5.25a2.25 2.25 0 0 1 4.5 0V7.5" />],
  [IconName.Unlock, <path key="unlock" d="M4 7.5h8v6H4zM5.75 7.5V5.25a2.25 2.25 0 0 1 4.4-.65" />],
  [IconName.Chevron, <path key="chevron" d="M6 3.5 10.5 8 6 12.5" />],
  [
    IconName.Eye,
    <path
      key="eye"
      d="M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"
    />,
  ],
  [
    IconName.EyeClosed,
    <path
      key="eyeClosed"
      d="M1.5 8S4 3.75 8 3.75 14.5 8 14.5 8 12 12.25 8 12.25 1.5 8 1.5 8zM8 6a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM2.5 2.5l11 11"
    />,
  ],
  [IconName.Refresh, <path key="refresh" d="M13 8a5 5 0 1 1-1.5-3.55M13 2.75v3h-3" />],
  [IconName.Zap, <path key="zap" d="M9 1.75 3.75 9H8l-1 5.25L12.25 7H8z" />],
  [IconName.Sliders, <path key="sliders" d="M2.5 5h2m3 0h6m-11 6h6m3 0h2M6 3.5v3M10 9.5v3" />],
  [IconName.Close, <path key="close" d="M4 4l8 8m0-8-8 8" />],
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
    {SHAPES.get(name)}
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

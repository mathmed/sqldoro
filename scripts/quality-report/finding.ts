import type { Status } from './status.ts'

export const DetailsFormat = {
  Text: 'text',
  Markdown: 'markdown',
} as const

export type DetailsFormat = (typeof DetailsFormat)[keyof typeof DetailsFormat]

export interface Details {
  readonly title: string
  readonly body: string
  readonly format: DetailsFormat
}

export interface Finding {
  readonly status: Status
  readonly summary: string
  readonly details?: Details
}

export function finding(status: Status, summary: string, details?: Details): Finding {
  return details === undefined ? { status, summary } : { status, summary, details }
}

export function textDetails(title: string, body: string): Details | undefined {
  return body === '' ? undefined : { title, body, format: DetailsFormat.Text }
}

export function markdownDetails(title: string, body: string): Details | undefined {
  return body === '' ? undefined : { title, body, format: DetailsFormat.Markdown }
}

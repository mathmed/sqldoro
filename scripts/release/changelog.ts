// CHANGELOG.md follows Keep a Changelog (https://keepachangelog.com/en/1.1.0/): a release is a
// "## [1.2.3] - 2026-10-10" section, and its notes are the lines up to the next section.
const HEADING_START = '## ['
const VERSION_END = ']'
const DATE_SEPARATOR = ' - '
const DATE = /^\d{4}-\d{2}-\d{2}$/u
const LINK_DEFINITION = /^\[[^\]]+\]: /u

export interface Release {
  readonly version: string
  readonly date: string
  readonly notes: string
}

interface Heading {
  readonly line: number
  readonly version: string
  readonly date: string
}

function headingOf(text: string, line: number): Heading[] {
  const end = text.indexOf(VERSION_END)
  if (!text.startsWith(HEADING_START) || end === -1) {
    return []
  }
  const rest = text.slice(end + VERSION_END.length)
  const date = rest.startsWith(DATE_SEPARATOR) ? rest.slice(DATE_SEPARATOR.length).trim() : ''
  return [{ line, version: text.slice(HEADING_START.length, end), date }]
}

// The section of a version, without the link definitions that close the file.
export function findRelease(changelog: string, version: string): Release | undefined {
  const lines = changelog.split('\n')
  const headings = lines.flatMap(headingOf)
  const heading = headings.find((candidate) => candidate.version === version)
  if (heading === undefined) {
    return undefined
  }
  const end = headings.find((candidate) => candidate.line > heading.line)?.line ?? lines.length
  const notes = lines
    .slice(heading.line + 1, end)
    .filter((line) => !LINK_DEFINITION.test(line))
    .join('\n')
    .trim()
  return { version, date: heading.date, notes }
}

export function isReleaseDate(date: string): boolean {
  return DATE.test(date)
}

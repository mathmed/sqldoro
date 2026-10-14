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

const UNRELEASED = 'Unreleased'
const UNRELEASED_HEADING = `## [${UNRELEASED}]`
const UNRELEASED_LINK = `[${UNRELEASED}]: `
const COMPARE = '/compare/'
const HEAD_SUFFIX = '...HEAD'

export interface ChangelogRelease {
  readonly version: string
  readonly tag: string
  readonly date: string
}

export type ChangelogEdit =
  | { readonly isReady: true; readonly changelog: string }
  | { readonly isReady: false; readonly problems: readonly string[] }

interface CompareLink {
  readonly line: number
  readonly repository: string
  readonly previousTag: string
}

// What a release does to CHANGELOG.md: what [Unreleased] lists becomes the dated section of the
// version, and the compare links at the bottom move on to its tag.
export function releaseUnreleased(changelog: string, release: ChangelogRelease): ChangelogEdit {
  const lines = changelog.split('\n')
  const link = lines.flatMap(compareLinkOf)[0]
  const problems = [...unreleasedProblems(changelog, release.version), ...linkProblems(link)]
  if (link === undefined || problems.length > 0) {
    return { isReady: false, problems }
  }
  return { isReady: true, changelog: lines.flatMap(lineEditor(link, release)).join('\n') }
}

function unreleasedProblems(changelog: string, version: string): string[] {
  const notes = findRelease(changelog, UNRELEASED)?.notes
  return [
    ...(notes === undefined ? [`CHANGELOG.md has no "${UNRELEASED_HEADING}" section`] : []),
    ...(notes === '' ? [`the "${UNRELEASED_HEADING}" section of CHANGELOG.md is empty`] : []),
    ...(findRelease(changelog, version) === undefined
      ? []
      : [`CHANGELOG.md already has a section for ${version}`]),
  ]
}

function linkProblems(link: CompareLink | undefined): string[] {
  return link === undefined
    ? [`CHANGELOG.md has no "${UNRELEASED_LINK}<repository>${COMPARE}<tag>${HEAD_SUFFIX}" link`]
    : []
}

function compareLinkOf(text: string, line: number): CompareLink[] {
  if (!text.startsWith(UNRELEASED_LINK) || !text.endsWith(HEAD_SUFFIX)) {
    return []
  }
  const url = text.slice(UNRELEASED_LINK.length, -HEAD_SUFFIX.length)
  const compare = url.lastIndexOf(COMPARE)
  return compare === -1
    ? []
    : [
        {
          line,
          repository: url.slice(0, compare),
          previousTag: url.slice(compare + COMPARE.length),
        },
      ]
}

function lineEditor(
  { line: linkLine, repository, previousTag }: CompareLink,
  { version, tag, date }: ChangelogRelease,
): (line: string, index: number) => string[] {
  const releaseLinks = [
    `${UNRELEASED_LINK}${repository}${COMPARE}${tag}${HEAD_SUFFIX}`,
    `[${version}]: ${repository}${COMPARE}${previousTag}...${tag}`,
  ]
  return (line, index) => {
    if (line === UNRELEASED_HEADING) {
      return [line, '', `## [${version}] - ${date}`]
    }
    return index === linkLine ? releaseLinks : [line]
  }
}

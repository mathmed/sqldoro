import { stripVTControlCharacters } from 'node:util'

const TRUNCATION_NOTE = '[...truncated...]'
// npm echoes the script it runs ("> sqldoro@0.0.1 lint") and adds a trailer when it fails.
const NOISE_PREFIXES = ['> ', 'npm error ', 'npm ERR! ']

export function plural(count: number, singular: string, pluralForm: string): string {
  return `${String(count)} ${count === 1 ? singular : pluralForm}`
}

// Drops colors, npm noise and the blank lines around the output, but keeps the indentation tools
// use to structure it.
export function cleanOutput(output: string): string {
  const lines = stripVTControlCharacters(output)
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => !NOISE_PREFIXES.some((prefix) => line.startsWith(prefix)))
  const first = lines.findIndex((line) => line !== '')
  const last = lines.findLastIndex((line) => line !== '')
  return lines.slice(first, last + 1).join('\n')
}

export function tail(text: string, limit: number): string {
  if (text.length <= limit) {
    return text
  }
  return `${TRUNCATION_NOTE}\n${text.slice(text.length - limit)}`
}

export function linesMatching(pattern: RegExp, text: string): string[] {
  return text.split('\n').filter((line) => pattern.test(line))
}

export function orElse(text: string, fallback: string): string {
  return text === '' ? fallback : text
}

export function compareText(left: string, right: string): number {
  return left.localeCompare(right)
}

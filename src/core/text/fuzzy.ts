// Finding a name as it is typed, like VS Code does: whatever the case, the characters of the text in
// the name in order. The text whole in the name ranks first, then the text spread over the starts of
// its words (`trst` in `transaction_status`, `ts` in `TransactionStatus`), then the characters
// anywhere in order (`trsa` in `Transaction`).
export const MatchRank = {
  Substring: 0,
  WordStarts: 1,
  Subsequence: 2,
} as const

export type MatchRank = (typeof MatchRank)[keyof typeof MatchRank]

// Where the text is in a name: the start and the end (excluded) of each run of matched characters.
export type Highlight = readonly [start: number, end: number]

export interface NameMatch {
  readonly rank: MatchRank
  // Where the first matched character is.
  readonly start: number
  readonly nameLength: number
  readonly highlights: readonly Highlight[]
}

// Characters that end a word and start the next (snake_case, kebab-case, schema.table).
const SEPARATORS: ReadonlySet<string> = new Set(['_', '-', ' ', '.', '$'])

// How the text is in the name, if it is; an empty text matches nothing.
export function matchName(name: string, text: string): NameMatch | undefined {
  const needle = text.trim().toLowerCase()
  if (needle === '') {
    return undefined
  }
  const lower = name.toLowerCase()
  const found = substringOf(lower, needle) ?? spreadOf({ name, lower }, needle)
  return found === undefined ? undefined : matchOf(found, name.length)
}

interface Name {
  readonly name: string
  readonly lower: string
}

// The text spread over the name: a name that does not hold its characters in order is left at
// once (most names, on every keystroke); the starts of words are only looked for in the others.
function spreadOf({ name, lower }: Name, needle: string): Found | undefined {
  const subsequence = subsequenceOf(lower, needle)
  if (subsequence === undefined) {
    return undefined
  }
  return wordStartsOf({ lower, starts: wordStarts({ name, lower }) }, needle) ?? subsequence
}

// Better matches first: by rank, then the earlier, then the shorter name.
export function compareMatches(first: NameMatch, second: NameMatch): number {
  const differences = [
    first.rank - second.rank,
    first.start - second.start,
    first.nameLength - second.nameLength,
  ]
  return differences.find((difference) => difference !== 0) ?? 0
}

interface Found {
  readonly rank: MatchRank
  readonly indexes: readonly number[]
}

function matchOf({ rank, indexes }: Found, nameLength: number): NameMatch {
  return { rank, start: Math.min(...indexes), nameLength, highlights: runsOf(indexes) }
}

// Consecutive indexes make one run.
function runsOf(indexes: readonly number[]): Highlight[] {
  const runs: [number, number][] = []
  for (const index of indexes) {
    const last = runs.at(-1)
    if (last?.[1] === index) {
      last[1] = index + 1
    } else {
      runs.push([index, index + 1])
    }
  }
  return runs
}

function range(start: number, length: number): number[] {
  return Array.from({ length }, (...[, offset]) => start + offset)
}

function substringOf(lower: string, needle: string): Found | undefined {
  const start = lower.indexOf(needle)
  return start === -1
    ? undefined
    : { rank: MatchRank.Substring, indexes: range(start, needle.length) }
}

function isSeparator(character: string): boolean {
  return SEPARATORS.has(character)
}

function isUpper({ name, lower }: Name, index: number): boolean {
  return name.charAt(index) !== lower.charAt(index)
}

// A word starts at the start of the name, after a separator, and at an upper case letter that
// follows a lower case one (camelCase).
function isWordStart(name: Name, index: number): boolean {
  if (isSeparator(name.lower.charAt(index))) {
    return false
  }
  return (
    index === 0 ||
    isSeparator(name.lower.charAt(index - 1)) ||
    (isUpper(name, index) && !isUpper(name, index - 1))
  )
}

function wordStarts(name: Name): number[] {
  return range(0, name.name.length).filter((index) => isWordStart(name, index))
}

interface Words {
  readonly lower: string
  readonly starts: readonly number[]
}

function wordStartsOf(words: Words, needle: string): Found | undefined {
  const indexes = fromWord(words, { needle, word: 0 })
  return indexes === undefined ? undefined : { rank: MatchRank.WordStarts, indexes }
}

interface Step {
  readonly needle: string
  readonly word: number
}

// The rest of the text as the starts of the words from this one on, each word taking as much of it
// as it can, and giving some back when the next words cannot take the rest.
function fromWord(words: Words, { needle, word }: Step): number[] | undefined {
  if (needle === '') {
    return []
  }
  for (const [offset, start] of words.starts.slice(word).entries()) {
    const found = inWord(words, { needle, word: word + offset, start })
    if (found !== undefined) {
      return found
    }
  }
  return undefined
}

interface WordStep extends Step {
  readonly start: number
}

function inWord(words: Words, { needle, word, start }: WordStep): number[] | undefined {
  for (let taken = sharedPrefix(words.lower.slice(start), needle); taken > 0; taken -= 1) {
    const rest = fromWord(words, { needle: needle.slice(taken), word: word + 1 })
    if (rest !== undefined) {
      return [...range(start, taken), ...rest]
    }
  }
  return undefined
}

function sharedPrefix(text: string, needle: string): number {
  let length = 0
  while (length < needle.length && text.charAt(length) === needle.charAt(length)) {
    length += 1
  }
  return length
}

// Each character of the text at its first place after the one before.
function subsequenceOf(lower: string, needle: string): Found | undefined {
  const indexes: number[] = []
  let from = 0
  for (const character of needle) {
    const index = lower.indexOf(character, from)
    if (index === -1) {
      return undefined
    }
    indexes.push(index)
    from = index + 1
  }
  return { rank: MatchRank.Subsequence, indexes }
}

// The lines of the new side of a diff without context (`git diff --unified=0`), by file.
const NEW_FILE_HEADER = '+++ b/'
const HUNK_PREFIX = '@@ '
// "@@ -12,3 +14,5 @@": the new side, third word, starts at line 14 and holds 5 lines (1 when the
// count is omitted).
const NEW_SIDE_WORD = 2
const DECIMAL = 10

export function touchedLines(diff: string): ReadonlyMap<string, readonly number[]> {
  const lines = new Map<string, number[]>()
  let file: number[] | undefined
  for (const line of diff.split('\n')) {
    if (line.startsWith(NEW_FILE_HEADER)) {
      file = []
      lines.set(line.slice(NEW_FILE_HEADER.length), file)
    }
    file?.push(...hunkLines(line))
  }
  return lines
}

function hunkLines(line: string): number[] {
  return line.startsWith(HUNK_PREFIX) ? newSideLines(line.split(' ').at(NEW_SIDE_WORD) ?? '') : []
}

// "+14,5" or "+14". A hunk that only deletes holds no new line: the lines around the deletion
// stand for it, so that the declaration it was cut from is still mutated.
function newSideLines(newSide: string): number[] {
  const parts = newSide.slice(1).split(',')
  const start = Number.parseInt(String(parts.at(0)), DECIMAL)
  const count = parts.length > 1 ? Number.parseInt(String(parts.at(1)), DECIMAL) : 1
  if (!Number.isInteger(start) || !Number.isInteger(count)) {
    return []
  }
  if (count === 0) {
    return [Math.max(start, 1), start + 1]
  }
  return [...Array.from({ length: count }).keys()].map((index) => start + index)
}

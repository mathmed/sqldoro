import { AST_NODE_TYPES, parse, type TSESTree } from '@typescript-eslint/typescript-estree'

export interface LineRange {
  readonly start: number
  readonly end: number
}

// A top-level statement, and the members it holds when it declares a class.
interface Unit {
  readonly range: LineRange
  readonly members: readonly LineRange[]
}

// The top-level declarations of a module that hold one of the lines, or in a class the members
// that do: the units mutation testing scopes a change to. A line of a class outside its members
// (its name, a decorator) selects the whole class; a line outside every statement selects nothing.
export function touchedDeclarations(
  source: string,
  lines: readonly number[],
  isJsx: boolean,
): LineRange[] {
  const units = parse(source, { loc: true, jsx: isJsx }).body.map(unitOf)
  const touched = lines.flatMap((line) => innermost(units, line))
  const unique = new Map(touched.map((range) => [mutateRange('', range), range]))
  return [...unique.values()].toSorted((left, right) => left.start - right.start)
}

function unitOf(statement: TSESTree.ProgramStatement): Unit {
  const declaration = declarationOf(statement)
  const members = declaration?.type === AST_NODE_TYPES.ClassDeclaration ? declaration.body.body : []
  return { range: rangeOf(statement), members: members.map(rangeOf) }
}

function declarationOf(statement: TSESTree.ProgramStatement): TSESTree.Node | null {
  return statement.type === AST_NODE_TYPES.ExportNamedDeclaration ||
    statement.type === AST_NODE_TYPES.ExportDefaultDeclaration
    ? statement.declaration
    : statement
}

function innermost(units: readonly Unit[], line: number): LineRange[] {
  const unit = units.find(({ range }) => holds(range, line))
  if (unit === undefined) {
    return []
  }
  return [unit.members.find((member) => holds(member, line)) ?? unit.range]
}

function rangeOf(node: TSESTree.Node): LineRange {
  return { start: node.loc.start.line, end: node.loc.end.line }
}

function holds({ start, end }: LineRange, line: number): boolean {
  return start <= line && line <= end
}

// Stryker's `mutate` pattern of a range of lines of a file: "<file>:<start>-<end>".
export function mutateRange(file: string, { start, end }: LineRange): string {
  return `${file}:${String(start)}-${String(end)}`
}

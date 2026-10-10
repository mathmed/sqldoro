export type JsonObject = ReadonlyMap<string, unknown>

interface JsonKind<T> {
  readonly description: string
  readonly matches: (value: unknown) => value is T
}

export const STRING: JsonKind<string> = {
  description: 'a string',
  matches: (value): value is string => typeof value === 'string',
}

export const NUMBER: JsonKind<number> = {
  description: 'a number',
  matches: (value): value is number => typeof value === 'number' && Number.isFinite(value),
}

export const BOOLEAN: JsonKind<boolean> = {
  description: 'a boolean',
  matches: (value): value is boolean => typeof value === 'boolean',
}

export const ARRAY: JsonKind<readonly unknown[]> = {
  description: 'an array',
  matches: (value): value is readonly unknown[] => Array.isArray(value),
}

export function parseObject(value: unknown): JsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError('expected a JSON object')
  }
  return new Map<string, unknown>(Object.entries(value))
}

export function field<T>(object: JsonObject, name: string, kind: JsonKind<T>): T {
  const value = object.get(name)
  if (!kind.matches(value)) {
    throw new TypeError(`expected "${name}" to be ${kind.description}`)
  }
  return value
}

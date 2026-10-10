import type { Engine } from './engine.ts'

// The engines the extension knows: adding one means registering its driver here, nothing else.
export class EngineRegistry {
  readonly #byId: ReadonlyMap<string, Engine>
  readonly #byScheme: ReadonlyMap<string, Engine>

  constructor(engines: readonly Engine[]) {
    this.#byId = indexUniquely(
      engines.map((engine) => [engine.id, engine]),
      'engine id',
    )
    this.#byScheme = indexUniquely(
      engines.flatMap((engine) =>
        engine.urlSchemes.map((scheme) => [scheme.toLowerCase(), engine]),
      ),
      'URL scheme',
    )
  }

  get engines(): readonly Engine[] {
    return [...this.#byId.values()]
  }

  get urlSchemes(): readonly string[] {
    return [...this.#byScheme.keys()]
  }

  find(id: string): Engine | undefined {
    return this.#byId.get(id)
  }

  findByScheme(scheme: string): Engine | undefined {
    return this.#byScheme.get(scheme.toLowerCase())
  }

  get(id: string): Engine {
    const engine = this.find(id)
    if (engine === undefined) {
      throw new Error(`Unknown database engine "${id}"`)
    }
    return engine
  }
}

function indexUniquely(
  entries: readonly (readonly [string, Engine])[],
  kind: string,
): ReadonlyMap<string, Engine> {
  const index = new Map<string, Engine>()
  for (const [key, engine] of entries) {
    if (index.has(key)) {
      throw new Error(`Duplicate ${kind} "${key}"`)
    }
    index.set(key, engine)
  }
  return index
}

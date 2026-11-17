import { ARRAY, field, type JsonObject, parseObject, STRING } from '../shared/json.ts'

// What other extensions, keybindings, settings files and users rely on: the ids of the contributed
// commands, views and view containers, and each setting with its type and allowed values.
export interface Contract {
  readonly commands: ReadonlySet<string>
  readonly views: ReadonlySet<string>
  readonly viewContainers: ReadonlySet<string>
  readonly settings: ReadonlyMap<string, Setting>
}

export interface Setting {
  readonly type: string
  // The values of `enum`, or of `items.enum` for a list: a setting file may hold any of them.
  readonly values: readonly string[]
}

export function readContract(packageJson: string): Contract {
  const contributes = optionalObject(parseObject(JSON.parse(packageJson)), 'contributes')
  return {
    commands: new Set(listOf(contributes, 'commands').map((command) => idOf(command, 'command'))),
    views: idsOfGroups(optionalObject(contributes, 'views')),
    viewContainers: idsOfGroups(optionalObject(contributes, 'viewsContainers')),
    settings: settingsOf(contributes),
  }
}

function optionalObject(object: JsonObject, name: string): JsonObject {
  const value = object.get(name)
  return value === undefined ? new Map() : parseObject(value)
}

function listOf(object: JsonObject, name: string): readonly unknown[] {
  return object.has(name) ? field(object, name, ARRAY) : []
}

function idOf(item: unknown, name: string): string {
  return field(parseObject(item), name, STRING)
}

// `views` and `viewsContainers` group their items by where they show: { "<place>": [{ "id" }] }.
function idsOfGroups(groups: JsonObject): ReadonlySet<string> {
  return new Set(
    [...groups.keys()].flatMap((group) => listOf(groups, group).map((item) => idOf(item, 'id'))),
  )
}

// `configuration` is one object or a list of them, each with its `properties`.
function settingsOf(contributes: JsonObject): ReadonlyMap<string, Setting> {
  const configuration = contributes.get('configuration')
  const sections = Array.isArray(configuration) ? configuration : [configuration ?? {}]
  return new Map(
    sections.flatMap((section) => {
      const properties = optionalObject(parseObject(section), 'properties')
      return [...properties].map(([key, value]): [string, Setting] => [key, settingOf(value)])
    }),
  )
}

function settingOf(value: unknown): Setting {
  const setting = parseObject(value)
  const type = setting.get('type')
  const items = optionalObject(setting, 'items')
  const values = setting.has('enum') ? listOf(setting, 'enum') : listOf(items, 'enum')
  return {
    type: typeof type === 'string' ? type : JSON.stringify(type ?? null),
    values: values.map((item) => JSON.stringify(item)),
  }
}

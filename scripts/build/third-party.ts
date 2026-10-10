import { isAbsolute, join } from 'node:path'

import { listFiles, readText } from '../shared/files.ts'
import { parseObject } from '../shared/json.ts'
import { compareText } from '../shared/text.ts'

// The libraries the bundles hold ship inside the .vsix: their licenses must allow it (they must all
// be compatible with sqldoro's MIT license) and their notices go along, in ThirdPartyNotices.txt.
const ALLOWED_LICENSES: ReadonlySet<string> = new Set([
  '0BSD',
  'Apache-2.0',
  'BlueOak-1.0.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'CC0-1.0',
  'ISC',
  'MIT',
  'Unlicense',
])
const NODE_MODULES = 'node_modules/'
const SCOPE_PREFIX = '@'
const LICENSE_FILES: readonly string[] = ['license', 'licence', 'copying']
const NOTICE_FILE = 'notice'
const SEPARATOR_WIDTH = 80
const SEPARATOR = '-'.repeat(SEPARATOR_WIDTH)

interface BundledPackage {
  readonly name: string
  readonly version: string
  readonly license: string
  readonly licenseText: string
  readonly noticeText: string
  readonly homepage: string
}

// The folder of the package a bundled module belongs to, relative to `root` unless absolute; the
// project's own modules and the bundler's virtual ones belong to none.
export function packageFolder(modulePath: string, root: string): string | undefined {
  const path = modulePath.replaceAll('\\', '/')
  const start = path.lastIndexOf(NODE_MODULES)
  if (start === -1) {
    return undefined
  }
  const end = start + NODE_MODULES.length
  const folder = path.slice(0, end) + packageName(path.slice(end))
  return isAbsolute(folder) ? folder : join(root, folder)
}

// "pg/lib/client.js" is in pg, "@tanstack/table-core/build/index.js" in @tanstack/table-core.
function packageName(pathInNodeModules: string): string {
  const [scope = '', name = ''] = pathInNodeModules.split('/')
  return scope.startsWith(SCOPE_PREFIX) ? `${scope}/${name}` : scope
}

export function packageFolders(modulePaths: readonly string[], root: string): string[] {
  const folders = modulePaths.map((path) => packageFolder(path, root))
  return [...new Set(folders.filter((folder) => folder !== undefined))]
}

// "MIT", { "type": "MIT" } or the old [{ "type": "MIT" }]: the license an npm manifest declares.
export function declaredLicense(manifest: ReadonlyMap<string, unknown>): string {
  const license = manifest.get('license') ?? manifest.get('licenses')
  return licenseName(Array.isArray(license) ? license.at(0) : license)
}

function licenseName(license: unknown): string {
  if (typeof license === 'string') {
    return license
  }
  return isRecord(license) ? textOf(parseObject(license).get('type')) : ''
}

function isRecord(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// An SPDX expression is allowed when one of its OR alternatives holds only allowed licenses.
export function isAllowedLicense(expression: string): boolean {
  const words = expression.replaceAll('(', ' ').replaceAll(')', ' ').split(' ')
  const alternatives = words
    .filter((word) => word !== '' && word !== 'AND')
    .join(' ')
    .split(' OR ')
  return alternatives.some((alternative) => {
    const licenses = alternative.split(' ').filter((license) => license !== '')
    return licenses.length > 0 && licenses.every((license) => ALLOWED_LICENSES.has(license))
  })
}

function licenseProblems(packages: readonly BundledPackage[]): string[] {
  const allowed = [...ALLOWED_LICENSES].join(', ')
  return packages
    .filter((bundled) => !isAllowedLicense(bundled.license))
    .map(
      (bundled) =>
        `${bundled.name}@${bundled.version} is bundled but its license, "${bundled.license}", is not one sqldoro can ship (${allowed})`,
    )
}

function renderNotices(packages: readonly BundledPackage[]): string {
  const header = [
    'sqldoro bundles the following libraries into the extension. Their licenses and notices follow.',
    '',
  ]
  const sections = packages
    .toSorted((left, right) => compareText(left.name, right.name))
    .map(renderPackage)
  return `${[...header, ...sections].join('\n')}\n`
}

function renderPackage(bundled: BundledPackage): string {
  const notice = bundled.noticeText === '' ? [] : ['', bundled.noticeText.trim()]
  return [
    SEPARATOR,
    `${bundled.name} ${bundled.version} (${bundled.license})`,
    '',
    licenseTextOf(bundled),
    ...notice,
    '',
  ].join('\n')
}

// A package without a license file still declares its license: the notice says so, and where the
// package comes from.
function licenseTextOf(bundled: BundledPackage): string {
  if (bundled.licenseText !== '') {
    return bundled.licenseText.trim()
  }
  const where = bundled.homepage === '' ? '' : `, see ${bundled.homepage}`
  return `The package ships no license file: it declares the ${bundled.license} license${where}.`
}

async function readBundledPackage(folder: string): Promise<BundledPackage> {
  const manifest = parseObject(JSON.parse(await readText(join(folder, 'package.json'))))
  const files = await listFiles(folder)
  return {
    name: textOf(manifest.get('name')),
    version: textOf(manifest.get('version')),
    license: declaredLicense(manifest),
    licenseText: await firstFile(folder, files.filter(isLicenseFile)),
    noticeText: await firstFile(folder, files.filter(isNoticeFile)),
    homepage: textOf(manifest.get('homepage')),
  }
}

function isLicenseFile(file: string): boolean {
  const name = file.toLowerCase()
  return LICENSE_FILES.some((license) => name.startsWith(license))
}

function isNoticeFile(file: string): boolean {
  return file.toLowerCase().startsWith(NOTICE_FILE)
}

function textOf(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

async function firstFile(folder: string, files: readonly string[]): Promise<string> {
  const [file] = files.toSorted(compareText)
  return file === undefined ? '' : readText(join(folder, file))
}

export interface Notices {
  readonly text: string
  readonly packageCount: number
  readonly problems: readonly string[]
}

// The notices of every library the bundled modules come from, and what forbids shipping them.
export async function thirdPartyNotices(
  modulePaths: readonly string[],
  root: string,
): Promise<Notices> {
  const packages = await Promise.all(packageFolders(modulePaths, root).map(readBundledPackage))
  return {
    text: renderNotices(packages),
    packageCount: packages.length,
    problems: licenseProblems(packages),
  }
}

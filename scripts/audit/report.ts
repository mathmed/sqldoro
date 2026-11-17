import { ARRAY, field, type JsonObject, NUMBER, parseObject, STRING } from '../shared/json.ts'

export interface Advisory {
  readonly id: string
  readonly packageName: string
  readonly range: string
  readonly severity: string
  readonly title: string
  readonly url: string
}

// The report format of npm 7 and later (`npm audit --json`).
const REPORT_VERSION = 2
const ADVISORY_ID = /\/(GHSA-[\w-]+)$/u

// Every advisory npm audit reports, once. A package that is only vulnerable through another one names
// it in `via` as a string; the advisories themselves are the objects.
export function readAdvisories(json: string): Advisory[] {
  const report = parseObject(JSON.parse(json))
  if (report.has('error')) {
    const error = parseObject(report.get('error'))
    throw new Error(`npm audit could not audit: ${field(error, 'summary', STRING)}`)
  }
  if (field(report, 'auditReportVersion', NUMBER) !== REPORT_VERSION) {
    throw new Error(`unknown npm audit report version (expected ${String(REPORT_VERSION)})`)
  }
  const advisories = new Map<string, Advisory>()
  for (const vulnerability of parseObject(report.get('vulnerabilities')).values()) {
    for (const via of field(parseObject(vulnerability), 'via', ARRAY)) {
      addAdvisory(advisories, via)
    }
  }
  return [...advisories.values()]
}

function addAdvisory(advisories: Map<string, Advisory>, via: unknown): void {
  if (typeof via === 'string') {
    return
  }
  const advisory = toAdvisory(parseObject(via))
  advisories.set(`${advisory.id} ${advisory.packageName} ${advisory.range}`, advisory)
}

function toAdvisory(via: JsonObject): Advisory {
  const url = field(via, 'url', STRING)
  return {
    id: ADVISORY_ID.exec(url)?.[1] ?? url,
    packageName: field(via, 'name', STRING),
    range: field(via, 'range', STRING),
    severity: field(via, 'severity', STRING),
    title: field(via, 'title', STRING),
    url,
  }
}

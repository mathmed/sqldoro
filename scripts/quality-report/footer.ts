const SHORT_SHA_LENGTH = 7
const DEFAULT_SERVER_URL = 'https://github.com'

export function footerFromEnvironment(environment: NodeJS.ProcessEnv): string {
  const repository = nonEmpty(environment['GITHUB_REPOSITORY'])
  const runId = nonEmpty(environment['GITHUB_RUN_ID'])
  if (repository === undefined || runId === undefined) {
    return ''
  }
  const server = nonEmpty(environment['GITHUB_SERVER_URL']) ?? DEFAULT_SERVER_URL
  return `${commitOf(environment)}[CI run](${server}/${repository}/actions/runs/${runId})`
}

function commitOf(environment: NodeJS.ProcessEnv): string {
  const sha = nonEmpty(environment['QUALITY_REPORT_SHA']) ?? nonEmpty(environment['GITHUB_SHA'])
  return sha === undefined ? '' : `commit \`${sha.slice(0, SHORT_SHA_LENGTH)}\` · `
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === '' ? undefined : value
}

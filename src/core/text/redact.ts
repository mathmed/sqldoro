const MASK = '***'
// The password of credentials embedded in a URL: scheme://user:password@host
const URL_PASSWORD = /(\/\/[^\s/:@]*):[^\s/@]*@/g

// Masks the secrets of a connection, and any password embedded in a URL, before text reaches a log
// or the screen.
export function redactSecrets(text: string, secrets: Iterable<string>): string {
  const longestFirst = [...secrets]
    .filter((secret) => secret !== '')
    .toSorted((left, right) => right.length - left.length)
  const masked = longestFirst.reduce((result, secret) => result.replaceAll(secret, MASK), text)
  return masked.replaceAll(URL_PASSWORD, `$1:${MASK}@`)
}

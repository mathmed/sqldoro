// The version number a server starts its version with: 8.0.45 of "8.0.45-log", 16.4 of
// "16.4 (Debian 16.4-1.pgdg120+1)", 10.11.6 of "10.11.6-MariaDB-0+deb12u1".
const LEADING_NUMBER = /^\d[\d.]*/

// Empty when the version does not start with a number: the whole of it stays in the tooltip.
export function shortServerVersion(version: string): string {
  return LEADING_NUMBER.exec(version)?.[0] ?? ''
}

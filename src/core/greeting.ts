const PRODUCT_NAME = 'sqldoro'
const DEVELOPMENT_SUFFIX = ' (development)'

export function buildGreeting(isDevelopment: boolean): string {
  const suffix = isDevelopment ? DEVELOPMENT_SUFFIX : ''
  return `Hello from ${PRODUCT_NAME}${suffix}!`
}

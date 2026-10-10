// Validation of single values as the user types them: each function returns the message to show,
// or undefined when the value is fine.
const MAX_NAME_LENGTH = 100
const MAX_HOST_LENGTH = 253
const MAX_LOGIN_LENGTH = 255
const MAX_PATH_LENGTH = 4096
const MIN_PORT = 1
const MAX_PORT = 65_535
const DIGITS = /^\d+$/
const HOST_DELIMITERS = /[\s/?#@,]/
const FIRST_PRINTABLE_CODE = 0x20
const DELETE_CODE = 0x7f

export function validateName(name: string): string | undefined {
  if (name.trim() === '') {
    return 'Enter a name for the connection'
  }
  return validateText('The name', name, MAX_NAME_LENGTH)
}

export function validateHost(host: string): string | undefined {
  if (host === '') {
    return 'Enter the host name or IP address of the server'
  }
  if (HOST_DELIMITERS.test(host)) {
    return 'The host cannot contain spaces or the characters / ? # @ ,'
  }
  return validateText('The host', host, MAX_HOST_LENGTH)
}

export function validateUser(user: string): string | undefined {
  if (user === '') {
    return 'Enter the user to log in as'
  }
  return validateText('The user', user, MAX_LOGIN_LENGTH)
}

export function validateDatabase(database: string): string | undefined {
  return validateText('The database', database, MAX_LOGIN_LENGTH)
}

export function validatePath(path: string): string | undefined {
  return validateText('The path', path, MAX_PATH_LENGTH)
}

export function parsePort(text: string): number | undefined {
  const port = DIGITS.test(text) ? Number(text) : Number.NaN
  return isPort(port) ? port : undefined
}

export function validatePortText(text: string): string | undefined {
  return validatePort(parsePort(text) ?? Number.NaN)
}

export function validatePort(port: number): string | undefined {
  return isPort(port)
    ? undefined
    : `The port must be a whole number from ${String(MIN_PORT)} to ${String(MAX_PORT)}`
}

function isPort(port: number): boolean {
  return Number.isInteger(port) && port >= MIN_PORT && port <= MAX_PORT
}

function validateText(subject: string, text: string, maxLength: number): string | undefined {
  if (text.length > maxLength) {
    return `${subject} must have at most ${String(maxLength)} characters`
  }
  if (Array.from(text, (character) => character.charCodeAt(0)).some(isControlCode)) {
    return `${subject} cannot contain control characters`
  }
  return undefined
}

function isControlCode(code: number): boolean {
  return code < FIRST_PRINTABLE_CODE || code === DELETE_CODE
}

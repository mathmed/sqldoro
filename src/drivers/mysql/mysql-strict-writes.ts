import type { Connection } from 'mysql2'

import type { RestoreSession } from '../../core/engine/engine.ts'
import { readString } from '../../core/json/record.ts'
import { queryRows, runQuery } from './mysql-catalog.ts'

// sql_mode is a variable of the session, not of the transaction: setting it changes neither the
// server nor other sessions, and it holds inside an open transaction too.
const SESSION_MODE = 'SELECT @@SESSION.sql_mode AS mode'
const SET_SESSION_MODE = 'SET SESSION sql_mode = ?'
// Either one makes MySQL refuse a value it cannot store, instead of storing the nearest one with a
// warning. sqldoro only edits InnoDB tables, which STRICT_TRANS_TABLES covers.
const STRICT_MODES: readonly string[] = ['STRICT_TRANS_TABLES', 'STRICT_ALL_TABLES']
const STRICT_WRITES = 'STRICT_TRANS_TABLES'
const SEPARATOR = ','
const NO_MODE = 'The server did not say the sql_mode of the session.'

async function keepSession(): Promise<void> {
  // The session was already strict: there is nothing to put back.
}

// The modes of the session, plus strict mode when it lacks one, until what it returns puts them
// back as they were.
export async function startStrictWrites(connection: Connection): Promise<RestoreSession> {
  const original = await sessionMode(connection)
  const modes = original.split(SEPARATOR).filter((mode) => mode !== '')
  if (STRICT_MODES.some((mode) => modes.includes(mode))) {
    return keepSession
  }
  await setSessionMode(connection, [...modes, STRICT_WRITES].join(SEPARATOR))
  return async () => setSessionMode(connection, original)
}

// Without the mode the session had, it could not be put back: nothing changes.
async function sessionMode(connection: Connection): Promise<string> {
  const [row] = await queryRows(connection, SESSION_MODE, [])
  if (row === undefined) {
    throw new Error(NO_MODE)
  }
  return readString(row, 'mode')
}

async function setSessionMode(connection: Connection, mode: string): Promise<void> {
  await runQuery(connection, SET_SESSION_MODE, [mode])
}

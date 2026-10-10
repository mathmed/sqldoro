import { describe, expect, it } from 'vitest'

import { MYSQL_LEXICAL, POSTGRES_LEXICAL } from '../../../test/fixtures/lexical.ts'
import { redactSqlSecrets } from './redact-sql.ts'

describe('redactSqlSecrets', () => {
  it('should mask every string of a statement that sets a password', () => {
    expect(redactSqlSecrets("CREATE USER 'app'@'%' IDENTIFIED BY \"s3cret\"", MYSQL_LEXICAL)).toBe(
      "CREATE USER '***'@'***' IDENTIFIED BY '***'",
    )
    expect(
      redactSqlSecrets("ALTER ROLE app WITH password 'x' VALID UNTIL 'y'", POSTGRES_LEXICAL),
    ).toBe("ALTER ROLE app WITH password '***' VALID UNTIL '***'")
  })

  it('should mask the strings that mention a password or a secret', () => {
    expect(
      redactSqlSecrets(
        "SELECT dblink_connect('host=db password=x'), 'plain', 'my Passwd', 'the secret'",
        POSTGRES_LEXICAL,
      ),
    ).toBe("SELECT dblink_connect('***'), 'plain', '***', '***'")
  })

  it('should keep statements without secrets as they are', () => {
    const sql = `SELECT "password", 'a' -- password\nFROM t`

    expect(redactSqlSecrets(sql, POSTGRES_LEXICAL)).toBe(sql)
  })
})

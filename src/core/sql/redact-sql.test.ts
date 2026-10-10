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

  it('should mask the strings of options named after a password, such as MySQL replication ones', () => {
    expect(
      redactSqlSecrets(
        "CHANGE REPLICATION SOURCE TO SOURCE_HOST = 'db', source_password = 'r3pl'",
        MYSQL_LEXICAL,
      ),
    ).toBe("CHANGE REPLICATION SOURCE TO SOURCE_HOST = '***', source_password = '***'")
    expect(redactSqlSecrets("CHANGE MASTER TO MASTER_PASSWORD = 'r3pl'", MYSQL_LEXICAL)).toBe(
      "CHANGE MASTER TO MASTER_PASSWORD = '***'",
    )
  })

  it('should keep the strings of statements that only name a column after a password', () => {
    const sql = "SELECT password_hash, passwords FROM users WHERE email = 'a@example.com'"

    expect(redactSqlSecrets(sql, POSTGRES_LEXICAL)).toBe(sql)
  })

  it('should keep statements without secrets as they are', () => {
    const sql = `SELECT "password", 'a' -- password\nFROM t`

    expect(redactSqlSecrets(sql, POSTGRES_LEXICAL)).toBe(sql)
  })
})

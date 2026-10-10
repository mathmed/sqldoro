# Security policy

sqldoro holds the keys to databases: we take reports seriously and thank everyone who makes one.

## Supported versions

sqldoro is young: security fixes go into the latest release only. Update to it before you report.

| Version      | Supported |
| ------------ | --------- |
| latest `0.x` | yes       |
| older        | no        |

## Reporting a vulnerability

**Do not open a public issue.** Report it privately through GitHub:
[_Security → Report a vulnerability_](https://github.com/mathmed/sqldoro/security/advisories/new)
on this repository. If that page is not available, open an issue that only asks for a private
contact, with no detail of the problem.

Please include what you found, the steps to reproduce it (versions of sqldoro, VS Code and the
database, the connection settings without their secrets, and the statements involved) and what an
attacker could do with it. Never send real passwords, tokens or data.

This is a volunteer project: expect an answer within a week, a fix as soon as one is ready, and
credit in the release notes if you want it. Please give us a reasonable time to ship the fix before
you disclose the problem.

## What counts

- A secret (a password, a passphrase, a key) that ends up in settings, logs, the extension's global
  state, an error message or anywhere outside VS Code's secret storage.
- A way to run a statement on a **read-only** connection that writes, or to get past a confirmation
  of the safety guards (every-row `UPDATE`/`DELETE`, production), without changing the connection's
  settings on purpose.
- A connection that is not what it claims: TLS certificates or SSH host keys not checked as the
  connection settings say.
- Code execution or data exfiltration through the result view (its Content Security Policy, the
  messages it accepts) or through a crafted value, file, URL or saved query.
- Any network call sqldoro makes other than to the databases and SSH servers you configure.

## What does not count

- The statement classifier failing to see what a stored procedure, a trigger or a function does: the
  README says it is best effort, and the read-only session and the database user's permissions are
  the guarantee. A way to make a **read-only session** write is in scope, though.
- Problems of the database servers, drivers or VS Code itself: report those upstream (we will help
  if sqldoro makes them worse).
- A user who allows writes on a connection, or types the confirmation, and runs a destructive
  statement.

## Recommended setup

Connect with the least privilege the work needs: a database user with read-only grants for browsing
production, and writes only where you mean to change data. Keep the connections that reach
production tagged `prod`. sqldoro's guards are seat belts, not access control.

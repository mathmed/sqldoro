# sqldoro

[![CI](https://github.com/mathmed/sqldoro/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mathmed/sqldoro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.140-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![No telemetry](https://img.shields.io/badge/telemetry-none-brightgreen.svg)](#privacy)

A fast, safe MySQL and PostgreSQL client that lives inside VS Code. Open source (MIT), no telemetry,
built to make the dangerous queries hard and the everyday ones quick.

> [!NOTE]
> Early development. Phase 1 (the foundation), phase 2 (the SQL editor and the result grid), phase 3
> (the safety guards) and phase 4 (inline editing) are in: saved MySQL and PostgreSQL connections with
> SSL and SSH tunnels, a schema explorer, SQL editors with autocomplete, a virtualized result grid,
> EXPLAIN, DDL, query history, saved queries, read-only connections enforced twice, confirmations for
> UPDATE and DELETE without WHERE and for production, manual transactions, an automatic LIMIT, and
> editing the rows of a table in the grid with a preview of the SQL that applies the changes. Polish
> and packaging come next, judged by the same strict pipeline.

## What works today

- **Connections view** in the activity bar: add, edit, duplicate, delete, test, connect and
  disconnect connections. Each connection shows its status (disconnected, connecting, connected,
  failed), its environment (tagged connections show a badge such as `PROD`, and the icon takes the
  environment's color, production in red) and whether it is read-only; **Allow Writes** and **Make
  Read-Only** change that.
- **Connection form**: a quick pick where each field shows its value and its problems; select a field
  to change it, then **Save** or **Test Connection**. Fields: name, engine, host, port, user, password,
  database, SSL (mode, CA certificate, client certificate and key, whether unauthorized certificates
  are rejected), SSH tunnel, environment tag (none, local, dev, staging, prod) and the read-only flag.
  New connections are **read-only** and untagged until you decide otherwise, and tagging a connection
  as production makes it read-only again (see [Safety model](#safety-model)).
- **Import from URL**: `mysql://`, `postgres://` and `postgresql://` URLs, with percent-encoded user,
  password and database, IPv6 hosts in brackets and the SSL parameters of both dialects (`sslmode` or
  `ssl-mode`, `sslrootcert`/`ssl-ca`, `sslcert`/`ssl-cert`, `sslkey`/`ssl-key`, `ssl=true`). The
  form opens with what the URL holds for you to review; unknown parameters are reported, and `prefer`
  is turned into `require` rather than silently falling back to plain text.
- **SSL modes**: `disable`; `require` (encrypted, and the certificate must verify unless you accept
  unauthorized certificates); `verify-ca` (trusted certificate, any host name); `verify-full`
  (trusted certificate naming the host). Certificates are checked against the database host name even
  through an SSH tunnel.
- **SSH tunnels** with a password (also answering keyboard-interactive prompts) or a private key and
  its passphrase. The tunnel listens on `127.0.0.1` only, and closes with the session. Host keys are
  trusted on first use like OpenSSH: sqldoro shows the SHA256 fingerprint the first time and warns
  loudly if it changes.
- **Secrets**: passwords and passphrases live only in VS Code's `SecretStorage`; the rest of a
  connection is saved in the extension's global state (not synced). Errors and logs never show them.
- **Schema explorer**: connection → databases → schemas (PostgreSQL) → tables and views → columns,
  indexes and foreign keys, loaded when a node opens. **Filter** shows only the tables and views whose
  name contains some text; **Refresh** reloads a node or everything.
- **SQL editors bound to a connection**: **New Query** (from a connection, database or schema in the
  explorer, or from the Command Palette) opens a SQL editor that runs on that connection, database and
  schema; any other SQL document gets one with **Change Editor Connection**. The status bar shows where
  the editor in front runs (click it to change), or that a query runs (click it to cancel). Each editor
  runs on its own database session, so a long query in one editor never blocks another or the
  explorer; the binding is remembered per workspace.
- **Running**: **Run Query** (`Ctrl+Enter`, `Cmd+Enter` on macOS) runs the selection, or the statement
  under the cursor; **Run Script** (`Ctrl+Alt+Enter`) runs every statement of the editor in order and
  stops at the first error. Statements are split without parsing SQL: semicolons inside strings,
  quoted identifiers, comments and PostgreSQL dollar-quoted bodies do not end a statement.
  **Cancel Query** stops the statement on the server (`KILL QUERY` in MySQL, `pg_cancel_backend` in
  PostgreSQL) and the result says truthfully whether it stopped or had already finished. A failed
  statement shows the server's message, and its position is underlined in the editor when the server
  gives one.
- **Result view**: a panel beside the editor with one tab per statement (status, duration, rows
  returned or affected, and the statements a failure left unrun). The grid is virtualized and pages
  rows from the extension host as you scroll, so a million rows scroll smoothly while the webview holds
  only a few thousand. Click a header to sort (Shift for several columns), type in the filter row to filter
  (contains, without case), drag a header edge to resize. The view sorts and filters the rows already
  fetched; for a query that only reads, **Sort and filter on the server** runs it again inside
  `SELECT * FROM (...)` with the filters as bound values instead. Select cells with the mouse or the
  keyboard (arrows, Page Up/Down, Home/End, Shift to extend, `Ctrl+A`), copy them as TSV (`Ctrl+C`),
  CSV, JSON or `INSERT` statements, and export the whole result (as sorted and filtered) to CSV, JSON or
  SQL, streamed to the file you pick. `NULL` and the empty string look different; long text, JSON and
  binary values open whole in a detail pane (double click or `Enter`), with JSON pretty-printed without
  losing digits. The grid follows the VS Code theme.
- **Inline editing**: the rows of a query that reads one table (a plain `SELECT` of its columns that
  includes its primary key, or a unique key without NULLs) can be edited in the grid; any other result
  says why it stays read-only (see [Editing rows](#editing-rows)). `Enter`, `F2` or typing edits a
  cell, `Enter` puts the value in, `Tab` and `Shift+Tab` move along the row and `Escape` leaves the cell
  as it was. Values are checked as you type, for the type of their column (whole numbers in range,
  decimals within their precision, dates and times, JSON, enums and sets, lengths); nothing is coerced,
  and binary values stay read-only. The edit bar adds, duplicates and deletes rows (`Delete` marks the
  selected ones), sets cells to `NULL` or `DEFAULT`, and reverts cells or everything. Changes stay
  pending, and look it (changed cells, new rows and rows to delete each in their own theme color), until
  **Preview Changes…** (`Ctrl+S`, `Cmd+S` on macOS) shows the exact statements, their bound values and
  the rows each must change, and you apply them: in one transaction, all or nothing, then the rows are
  read again where you were. **Copy Rows as INSERT** copies the selected rows whole.
- **Exact values**: `BIGINT`, `DECIMAL`/`NUMERIC` and dates are shown exactly as the server sent them,
  whatever the time zone of the machine; numbers are never rounded through JavaScript numbers.
- **Autocomplete**: databases or schemas, tables and views, the columns of the tables in the statement
  (aliases included) and keywords, quoted when a name needs it. The catalog is read from the session of
  the explorer, cached, and refreshed with the explorer and after a statement that changes the schema;
  a slow catalog never blocks typing.
- **Show DDL** of a table or view (from the explorer) in a read-only SQL document; **Explain Query**
  shows the plan of a statement; **Explain Analyze Query** asks first, because it runs the statement,
  and only runs queries that only read.
- **Safety guards** on every statement that runs (editor, script, history, EXPLAIN, server view, load
  all): read-only connections refuse anything that may write, both in sqldoro and in the database
  session; an `UPDATE` or `DELETE` that reaches every row waits for its table name to be typed; a
  write on production waits for the connection name to be typed; manual transactions with **Commit
  Transaction** and **Roll Back Transaction**; an automatic `LIMIT` with **Load All Rows**. The
  environment shows in the status bar (red for production), on the editor tab and above the results.
  Details in [Safety model](#safety-model).
- **Query history** view: every statement you ran, per connection, newest first and searchable
  (**Search Query History**); open it in an editor, run it again, copy or delete it. The statements
  that apply the changes of the grid are not kept: they hold the values that were written. Running the same
  statement again moves it to the top; statements that set a password are kept with their strings
  masked.
- **Saved queries** view: named queries in folders; save the selection or the editor, open or insert
  one, rename, move, delete, and import or export them as a JSON file.

### Settings

| Setting                                   | Default    | Description                                                                   |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `sqldoro.results.maxRows`                 | `100000`   | Rows kept of a result (1 to 5,000,000); past it the result is flagged as cut. |
| `sqldoro.history.maxEntriesPerConnection` | `500`      | Statements the query history keeps per connection; the oldest go first.       |
| `sqldoro.autoLimit.enabled`               | `true`     | Give queries without a limit of their own the automatic `LIMIT`.              |
| `sqldoro.autoLimit.rows`                  | `1000`     | Rows the automatic limit keeps (never more than `results.maxRows`).           |
| `sqldoro.safety.productionEnvironments`   | `["prod"]` | Environment tags treated as production; `prod` always is.                     |
| `sqldoro.transactions.defaultMode`        | `"auto"`   | Transaction mode of new SQL editors: `auto` (auto-commit) or `manual`.        |

## Safety model

sqldoro makes the dangerous statements hard in layers. Each layer is honest about what it cannot do:
**the guarantee is the permissions of the database user**. Connect with a user that has only the
grants the work needs (a read-only role for browsing production), and treat the layers below as
seat belts, not as access control.

**One gate for every statement.** Whatever runs a statement (Run Query, Run Script, the history, a
saved query opened in an editor, EXPLAIN and EXPLAIN ANALYZE, sorting on the server, Load All Rows,
and the changes applied from the grid) goes through the same guard before anything runs: it
classifies each statement, applies the rules of the connection, asks for the confirmations they need
and logs the decision. A script is checked whole before its first statement runs, and the runner
refuses any statement the guard did not see. Only sqldoro's own statements bypass it: the catalog
queries of the explorer, `START TRANSACTION`, `COMMIT`, `ROLLBACK`, the savepoint of an apply that
joins an open transaction (`SAVEPOINT`, `RELEASE SAVEPOINT`, `ROLLBACK TO SAVEPOINT`) and the
transaction status probe.

**The classifier is best effort, and fails closed.** It reads each statement with the lexical rules
of its dialect (strings, quoted names, comments, MySQL's `/*! */` comments, which MySQL runs,
PostgreSQL's dollar quoting and nested comments) and sorts it as a read, a write, DDL, transaction
control, a session or administrative statement, or unknown. It looks inside queries for what makes
them more than a read: data-modifying `WITH` queries, `SELECT ... INTO`, `FOR UPDATE` and other
locking reads, and calls to functions with side effects that the dialect lists (`nextval`,
`set_config`, advisory locks, `GET_LOCK`...). `EXPLAIN` only reads unless `ANALYZE` runs the
statement. Anything it cannot read or does not know counts as a write. It cannot see what a stored
procedure, a trigger, a user function or a prepared statement does: that is what the next layer is
for.

| Guard                            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-only connections            | Refuse every statement that is not a read or transaction control (`SET`, `CALL`, unknown statements and `BEGIN READ WRITE` included), with a message and an **Allow Writes…** button. Allowing writes is a setting of the connection, confirmed on its own (typed on production); it never re-runs the statement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Read-only sessions               | The second layer: sessions of a read-only connection are opened read-only by the database (`SET default_transaction_read_only = on` in PostgreSQL, on every database the session opens; `SET SESSION TRANSACTION READ ONLY` in MySQL), so a write the classifier misses (a function that writes, a procedure) fails on the server. A statement could switch this off again (`SET`, `set_config`), which is why the classifier blocks those on read-only connections; server permissions remain the real guarantee. MySQL still lets a read-only transaction change `TEMPORARY` tables.                                                                                                                                                                                                                                                                                                                                                                                              |
| `UPDATE` / `DELETE` of every row | An `UPDATE` or `DELETE` (also inside a `WITH` query or under `EXPLAIN ANALYZE`) without its own `WHERE`, or whose `WHERE` is always true (`1 = 1`, `true`, a constant, `id = id`, an `OR` with such a branch), is held until the table name is typed, once, for that run; the override is logged. A `WHERE` inside a subquery does not count. A `JOIN ... ON` or `LIMIT` without `WHERE` is still held.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Production                       | Connections tagged with an environment of `sqldoro.safety.productionEnvironments` (`prod` always) ask for the connection name to be typed before any write, DDL, session or unknown statement, once per run; reads and transaction control run at once. Tagging a connection as production makes it read-only; the status bar turns red, the editor tab shows the badge and the result view a banner.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Manual transactions              | **Switch Transaction Mode** (status bar) per editor; `sqldoro.transactions.defaultMode` sets the mode of new editors. In manual mode the first statement opens a transaction (read-only on read-only connections) that stays open until **Commit Transaction** or **Roll Back Transaction**; the status bar shows it and counts its statements. After each statement sqldoro asks the server whether a transaction is open, so a transaction you open with `BEGIN`, one that DDL committed in MySQL, one a deadlock rolled back or one PostgreSQL aborted after an error (only a rollback ends it) all show as they are. Before DDL runs in a MySQL transaction, sqldoro warns that it commits. Closing the last tab of an editor with an open transaction asks to commit or roll back; closing the document, disconnecting or changing the connection rolls it back and says so. A transaction stays on its editor: the editor cannot change database or connection until it ends. |
| Automatic `LIMIT`                | A `SELECT`, `WITH` or `TABLE` query that only reads and has no `LIMIT`, `FETCH` or `TOP` of its own gets `LIMIT n + 1` after its last token (comments after it are kept), and the result says **limited to n rows** with **Load All Rows**, which runs it again without the automatic limit. Where appending is not safe (an `OFFSET`, MySQL executable comments) the driver stops reading after n rows instead. Statements that write, `EXPLAIN`, `SHOW` and queries already limited at their top level run as written.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

**The log.** The `sqldoro` output channel says what the guard decided (blocked, confirmed, allowed,
transactions opened, committed and rolled back, and how each apply of the grid ended) with the
connection name, the statement verbs and the table names: never the SQL text, bound values or
credentials.

### Editing rows

The grid writes only what it can write exactly, to the row it read, and says so before it does.

- **What can be edited.** The query must be one `SELECT` of plain columns from one table: no join,
  `DISTINCT`, `GROUP BY`, `UNION`, `WITH`, subquery or expression (`ORDER BY`, `WHERE`, `LIMIT` and
  aliases are fine). The server must say that every column comes from that table, and the catalog must
  describe it as a table that can roll changes back: views (updatable or not), materialized views,
  foreign tables, PostgreSQL tables that other tables inherit from and MySQL tables on an engine
  other than InnoDB are read-only. The result must hold the primary key, or a unique key without
  NULLs whose columns compare exactly (not floating point, JSON, binary or `SET`). Columns the server
  computes (generated, identity `ALWAYS`) and columns shown twice are read-only; adding rows needs
  every column without a default in the result. The analysis fails closed: what it cannot tell is
  read-only, and the grid says why. Read-only connections get no editing at all.
- **The statements.** One per changed row, every value bound as a parameter and every name quoted:
  deletions, then updates, then insertions. The `WHERE` names the row by its whole key and checks that
  the edited columns (every column, for a deletion) still hold what the grid read, text compared
  exactly (`COLLATE utf8mb4_bin` in MySQL) and `NULL` with `IS NULL`. A row that changed or went
  meanwhile is a conflict, reported on that row, never overwritten. No statement of the grid lacks a
  `WHERE`, and if one did the guard would hold it like any other.
- **The guard.** The statements of an apply, and the query that reads the rows again, go through the
  guard like typed SQL: blocked on read-only connections, the connection name typed on production,
  the decision logged. Deleting rows also asks for their number: typed on production, a button
  elsewhere.
- **The transaction.** An apply runs in a transaction of its own and commits only if every statement
  changed exactly the row it had to; a failure, a conflict or any other count rolls everything back,
  and the result says which row stopped it and why (every conflict is listed). In manual mode, or
  when the editor has a transaction open, the apply runs inside a savepoint of it that a failure rolls
  back to, and committing stays yours. MySQL edits need strict SQL mode, so that a value the column
  cannot hold is refused instead of cut.
- **Limits.** The changes wait in their result tab, at most 1,000 rows at a time. Running the editor
  again asks before dropping them, Load All Rows and sorting on the server wait until they are applied
  or reverted, and closing the result view warns that they were dropped. Dates and times are written
  and compared as the server shows them, in the time zone of the session.

## Planned v1 scope

- **Engines**: MySQL and PostgreSQL.
- **Connections**: saved connections with SSH tunnels and SSL/TLS. Passwords and keys live in VS Code
  `SecretStorage`, never in settings files.
- **Schema tree**: databases, schemas, tables, views, columns, indexes and the rest of the catalog.
- **SQL editor** with schema-aware autocomplete.
- **Result grid**: virtualized, fast on large result sets.
- **Inline editing** of results, with a preview of the SQL it will run before anything changes
  (shipped, see [Editing rows](#editing-rows)).
- **Tooling**: DDL of any object, `EXPLAIN`, query history and saved queries.
- **Safety guards** (shipped, see [Safety model](#safety-model)):
  - read-only by default: writing is something you turn on per connection;
  - `UPDATE` and `DELETE` without a `WHERE` are blocked;
  - environment tags (local, staging, production) that make it obvious where you are;
  - manual transactions: you decide when to commit or roll back;
  - automatic `LIMIT` on queries that would return everything.

### Out of scope for v1

ER diagrams, schema diff, data compare, an import wizard, NoSQL databases, engines other than MySQL
and PostgreSQL, an MCP server, and telemetry.

## Privacy

sqldoro has no telemetry, ever: no analytics, no crash reports, no network calls other than the
connections you configure to your own databases.

## Development

Requirements: Node.js 24 (the runtime of the VS Code extension host; `package.json` declares it in
`devEngines`, and npm refuses other versions), npm, VS Code to run the extension, and Docker with
Compose for the integration tests.

```sh
make setup        # npm ci (locked dependencies, no install scripts) and the git hooks
make quality      # every static check and the unit tests
make integration  # the drivers and the SSH tunnel against real servers (Docker)
```

Press **F5** in VS Code ("Run Extension") to build the extension and open it in an Extension
Development Host, then open the **sqldoro** view in the activity bar. `make integration` leaves its
servers running: connect the Extension Development Host to them (see
[Integration tests](#integration-tests-make-integration) for their ports and credentials).

### Commands

| Command                 | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `make setup`            | Install the locked dependencies and the git hooks.                                  |
| `make build`            | Bundle the extension (esbuild) and the result view (Vite) into `dist/`.             |
| `make format`           | Format every file (Prettier) and apply the fixes ESLint can make.                   |
| `make lint`             | ESLint (strict type-checked, complexity and security rules) and the Prettier check. |
| `make typecheck`        | tsc 7 strict on the whole project, then on the platform-agnostic core alone.        |
| `make test`             | Unit tests with coverage (Vitest); thresholds at 100% that only go up.              |
| `make lint-arch`        | Architecture contracts (dependency-cruiser).                                        |
| `make dead-code`        | Unused files, exports, dependencies and stale configuration (knip).                 |
| `make audit`            | Known vulnerabilities in the dependencies (`npm audit`).                            |
| `make quality`          | All of the above: what the pre-commit hook runs.                                    |
| `make integration`      | Start the test servers (Docker Compose) and run the integration tests.              |
| `make integration-down` | Stop and remove the integration test servers.                                       |
| `make smoke`            | Build and run the extension in a real VS Code (see below).                          |
| `make mutation`         | Mutation testing of the whole core (Stryker; slow, weekly in CI).                   |
| `make mutation-changed` | Mutation testing of the core files changed against `BASE` (default `origin/main`).  |
| `make all`              | Everything CI runs on a pull request.                                               |

### Architecture

```
src/
├── core/        # Engine interface, connection model, session opening, SQL splitting, autocomplete, the
│                #   result model and its message protocol, history, saved queries, the safety guards
│                #   (statement classifier, guard policy, automatic LIMIT, transactions) and the editing
│                #   of results (what can be edited, pending changes, their statements): pure TypeScript
├── drivers/     # One folder per database (mysql/ with mysql2, postgres/ with pg) implementing the engine interface
├── tunnel/      # The SSH tunnel (ssh2) implementing the core tunnel interface
├── extension/   # VS Code extension host: activation, commands, views, editors, result panels, storage
│   └── factories/   # the only place that instantiates the drivers and the SSH tunnel
└── webview/     # React result grid (TanStack Table and Virtual), a browser bundle built by Vite
scripts/         # CI tooling: build, smoke launcher, mutation runner and the Quality Report
test/            # Test support: fakes, the vscode fake, the integration servers and the VS Code suite
```

The core is the center: drivers implement its `Engine` interface, the SSH tunnel its `TunnelOpener`
interface, and the extension host talks to databases only through them. The core never imports
`vscode`, Node.js built-ins or database, SSH and UI libraries, because it also runs in the webview.
These rules are contracts checked on every commit (see
[Architecture contracts](#architecture-contracts-make-lint-arch)); `CLAUDE.md` lists them in full.

**Opening a session.** `openSession` (core) reads the certificate files through the platform, opens
the SSH tunnel when the connection has one (asking the extension whether the host key is trusted),
then asks the driver to connect to the tunnel's local end or straight to the database. If the driver
fails, the tunnel closes; closing the session closes the driver session, then the tunnel. When the
server or the network ends a session, the extension marks the connection as failed and says so.

**Adding an engine.** The core knows engines only through `EngineRegistry`: an engine brings its id,
name, default port, URL schemes and dialect (identifier quote, whether it has schemas), and connects.
Supporting another database means writing its driver and registering it in
`src/extension/factories/engines.ts`; nothing else in the core or the extension changes.

**The safety guards.** The statement classifier, the guard policy, the automatic `LIMIT` and the
transaction state machine are pure functions in `src/core/safety/`; dialects declare what differs
(lexical rules, functions with side effects, whether DDL is transactional). In the extension host,
`StatementGuard` applies them and asks for confirmations, and `QueryRunner` runs only what it
approved. Drivers add the session layer: read-only sessions, and the transaction status the server
reports (`EngineSession.transactionStatus`).

**The result view.** The extension host runs the statements and keeps their rows; the webview only
shows them. They talk through a typed message protocol declared in the core
(`src/core/results/protocol.ts`), and each side checks every message it receives field by field. The
webview asks for windows of rows around what is in view and keeps a bounded cache of them; sorting,
filtering, copying and exporting happen in the host on all the rows. The webview gets a strict Content
Security Policy with a nonce: no inline script, no remote resource.

**Editing rows.** Drivers say which table and column each result column comes from
(`ResultColumn.origin`, from the result metadata of the server) and describe a table for editing
(`EngineSession.describeTable`: its kind, columns, how each takes and compares values, and its
keys). `src/core/edits/` decides from these and from the text of the query whether a result can be
edited (`resultEditability`), keeps the pending changes as pure reducers, turns them into one
statement per row (`planEdits`) and judges what each statement did. The extension host keeps the
changes of each tab, previews the plan, and applies it through `QueryRunner.perform` like any other
run: the guard approves every statement first, and the batch runs only statements it approved.

**Exact values.** Drivers keep `DECIMAL`/`NUMERIC` and `BIGINT` as the text the server sent, dates
and JSON as the server formats them, and binary data as hexadecimal text: nothing depends on the time
zone of the machine or loses precision. Queries stream their rows in batches and keep at most a given
number of them; cancelling one stops it from another connection (`KILL QUERY` in MySQL,
`pg_cancel_backend` in PostgreSQL).

## Quality pipeline

The pipeline is a TypeScript port of [py-awesome-template](https://github.com/mathmed/py-awesome-template)'s:
the same layers, strict from day one, with no baseline. Code is refactored to meet the gates; the
gates are never loosened to meet the code.

| Layer              | Tool                                                                                                                                                                                                           | Runs in                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Lint               | ESLint 10 with typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, SonarJS, perfectionist (import order), eslint-comments; every rule an error, `--max-warnings 0`                                 | pre-commit, `lint` job         |
| Format             | Prettier                                                                                                                                                                                                       | pre-commit, `lint` job         |
| Types              | tsc 7 (native), `strict` plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `erasableSyntaxOnly`; the core also without platform types | pre-commit, `quality` job      |
| Complexity         | ESLint: cyclomatic complexity 5 (xenon A), cognitive complexity 5, nesting depth 2, 30 lines per function, 3 parameters, 300 lines per file; cannot be disabled inline                                         | pre-commit, `lint` job         |
| Security           | eslint-plugin-security (as errors), eslint-plugin-no-unsanitized, SonarJS security hotspots, bans on shell execution and `eval`; `npm audit`                                                                   | pre-commit, `lint`/`quality`   |
| Dead code          | knip, configuration hints as errors                                                                                                                                                                            | pre-commit, `quality` job      |
| Tests and coverage | Vitest with V8 coverage (Node.js, and jsdom with Testing Library for the webview), 100% statements, branches, functions and lines as a ratchet                                                                 | pre-commit, `quality` job      |
| Integration        | Vitest against real MySQL 8.4, PostgreSQL 18 and OpenSSH servers (service containers in CI, Docker Compose locally)                                                                                            | `integration` job              |
| Architecture       | dependency-cruiser contracts                                                                                                                                                                                   | pre-commit, `architecture` job |
| Smoke              | the built extension in a real VS Code (`@vscode/test-electron`, xvfb in CI)                                                                                                                                    | `smoke` job                    |
| Mutation testing   | Stryker, changed core files on PRs, whole core weekly, `MUTATION_MIN_SCORE` ratchet                                                                                                                            | `mutation` workflow            |
| Report             | one Quality Report comment per PR, built from the fragments of every job                                                                                                                                       | `quality-report` job           |

Git hooks run through [lefthook](https://lefthook.dev/): pre-commit formats the staged files and runs
`make quality`'s checks in parallel; commit-msg enforces Conventional Commits. Dependabot proposes
grouped weekly updates after a cooldown (major 15 days, minor 10, patch 5).

### Integration tests (`make integration`)

Unit tests stand in for the database servers with fakes of the client libraries (`test/fakes/`);
the integration tests run the drivers and the SSH tunnel against real servers instead:
`src/**/*.integration.test.ts` and `test/integration/*.integration.test.ts`, run by
`vitest.integration.config.ts`. `make integration` starts the servers of
`test/integration/compose.yaml` with Docker Compose (and leaves them running), then runs the tests;
CI starts the same images as service containers of the `integration` job.

| Server     | Image                       | Address           | User / password        | Database  |
| ---------- | --------------------------- | ----------------- | ---------------------- | --------- |
| MySQL      | `mysql:8.4.11`              | `127.0.0.1:33306` | `sqldoro / sqldoro-it` | `sqldoro` |
| PostgreSQL | `postgres:18.6-alpine`      | `127.0.0.1:35432` | `sqldoro / sqldoro-it` | `sqldoro` |
| OpenSSH    | `testcontainers/sshd:1.3.0` | `127.0.0.1:32222` | `root / sqldoro-it`    |           |

These are throwaway credentials of local test containers. The SSH server reaches the databases as
`mysql:3306` and `postgres:5432`. Each address can be overridden with `SQLDORO_IT_<SERVER>_HOST` and
`SQLDORO_IT_<SERVER>_PORT` (`MYSQL`, `POSTGRES`, `SSH`). The tests create their own tables and
schemas, wait for the servers to accept connections, and generate their SSH keys on the fly: no
private key is stored in the repository. The edits of the grid run there too: which results can be
edited, every type written and found again, conflicts, read-only sessions, and the extension host
wired as in VS Code (with the fake of the `vscode` module) applying, rolling back and confirming
changes on both servers.

### Extension smoke test (`make smoke`)

`scripts/smoke.ts` downloads VS Code (latest stable, or `SMOKE_VSCODE_VERSION`) with
[`@vscode/test-electron`](https://github.com/microsoft/vscode-test), starts it with the built
extension (`dist/`) in a fresh profile without telemetry, and runs `test/smoke/suite.ts` inside it:
the extension must activate, every command and view contributed in `package.json` must be registered
(each view opens and refreshes), `sqldoro.hello` must answer, and the result view of a SQL editor must
load (the React bundle runs under its Content Security Policy and tells the extension it is ready),
then close and load again.
Each step prints a `>> ` line (VS Code version, activation time, commands, views, result view load
time) that the Quality Report summarises. Linux needs a display: CI wraps it in `xvfb-run`, and
`make smoke` does the same on a headless machine that has it installed.

### Architecture contracts (`make lint-arch`)

[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) checks the imports of `src/`,
`scripts/` and `test/` against `.dependency-cruiser.mjs`:

- the core depends on no other layer, no `vscode`, no Node.js built-in and no database, SSH or UI
  library;
- drivers depend only on the core and their database client, never on each other, the tunnel, the
  SSH client, the extension host, the webview or `vscode`;
- the SSH tunnel depends only on the core, `ssh2` and Node.js, never on a driver, a database client,
  the extension host, the webview or `vscode`;
- only `src/extension/factories/` instantiates the drivers and the SSH tunnel;
- the extension host and the webview never import each other, and the webview uses no `vscode`,
  Node.js built-in, tunnel, database or SSH client;
- UI libraries (React, TanStack) belong to the webview: the core, the drivers, the tunnel and the
  extension host never import them;
- no circular dependencies, no product code importing CI scripts or tests (and the reverse), no
  devDependency in the shipped code, no undeclared or unresolvable import.

When a contract breaks, fix the import. Only relax a contract as a deliberate architecture decision
approved by the owner, never to make a check pass.

### Mutation testing (`make mutation`)

[Stryker](https://stryker-mutator.io/) changes the core code (flips a condition, empties a string,
removes a block...) and runs the unit tests against each change. A mutant that no test notices is a
**survivor**: that code runs, but its behaviour is not asserted. Coverage says the line ran; mutation
testing says whether a test would notice if it were wrong. The TypeScript checker discards mutants
that do not compile.

The scope is `src/core` (the engine interface and the safety guards), set by `mutate` in
`stryker.config.mjs`; drivers, the extension host and the webview are covered by unit and smoke tests.
The `Mutation testing` workflow runs:

- **on every PR**, through `ci.yml`, mutating only the core files changed in the diff
  (`git diff origin/<base>...HEAD`); when no core file changed it ends in seconds with "nothing to
  mutate";
- **weekly** (and on demand via `workflow_dispatch`) on the whole core.

The job fails when the score is below `MUTATION_MIN_SCORE`, a repository variable (Settings → Secrets
and variables → Actions → Variables, default `95`) that works as a ratchet: raise it as the score
allows, never lower it to get a PR green. Survivors appear in the Quality Report and the job summary
with file, line, mutator and replacement; the HTML report is uploaded as the `mutation-report`
artifact and written to `reports/mutation/` locally. For each survivor, add the missing assertion.

Stryker's Vitest runner cannot select tests on Vitest 5 yet
([stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210): every covered mutant
would "survive"), so mutants run through Stryker's command runner, one fresh Vitest process each,
running the tests of the core (where every mutant lives): the tests of the other layers open real SSH
sessions and would only make each run slower. Switch back to the Vitest runner with `perTest`
coverage once that fix is released.

## Quality Report

Every pull request gets **one** comment (marker `<!-- quality-report -->`, updated in place on every
push) with the verdict, a status table and a section per analysis: ✅ ok, ⚠️ warning, ❌ failed,
⏭️ not run (job cancelled or skipped, or nothing to do, such as no core file changed for mutation
testing). Long output goes inside collapsible `<details>` blocks, trimmed to fit in a GitHub comment.

| Section            | Tool                     | Job              | What the section shows                                                    |
| ------------------ | ------------------------ | ---------------- | ------------------------------------------------------------------------- |
| Lint and format    | ESLint + Prettier        | `lint`           | lint problems by rule and location; files that need formatting            |
| Types              | tsc                      | `quality`        | type errors                                                               |
| Security           | ESLint + npm audit       | `lint`/`quality` | security rule problems; vulnerable dependencies and advisories            |
| Dead code          | knip                     | `quality`        | unused files, exports and dependencies by kind                            |
| Complexity         | ESLint                   | `lint`           | functions above the complexity limits, by rule and location               |
| Tests and coverage | Vitest                   | `quality`        | passed/failed tests and coverage; failures or files below the thresholds  |
| Integration tests  | Vitest + real servers    | `integration`    | passed/failed tests against MySQL, PostgreSQL and SSH; the failures       |
| Architecture       | dependency-cruiser       | `architecture`   | modules checked; broken contracts and the violating imports               |
| Extension smoke    | esbuild + Vite + VS Code | `smoke`          | bundle sizes, VS Code version, activation, commands, views, result view   |
| Mutation testing   | Stryker (`mutation.yml`) | `mutation`       | score vs. ratchet, killed and surviving mutants by file, line and mutator |

**How it works.** Each analysis runs through `node scripts/quality-report.ts run <analysis> -- <command>`.
The wrapper streams the output, returns the tool's own exit code (the job is still the gate; the report
never decides what blocks) and saves a fragment, `quality-fragments/<analysis>.json`, which the job
uploads as the `quality-fragment-<job>` artifact. The final `quality-report` job (needs every analysis
job, runs `if: always()`, only on PRs, with `pull-requests: write`) downloads the fragments, renders
the report with `node scripts/quality-report.ts render` and upserts the comment. A job that failed,
was cancelled or produced no fragment appears as ❌ or ⏭️ instead of breaking the report. The report is
also written to the job summary, the fallback for PRs from forks, where the token is read-only and
posting the comment only emits a warning. The script uses only Node.js built-ins, so the report job
needs no `npm ci`. ESLint runs once: the report splits its problems into the Lint, Complexity and
Security sections by rule.

**Fragment contract.** A fragment is a JSON file
`{"analysis": "<id>", "exitCode": 0, "output": "<tool output>", "seconds": 1.2}`. The renderer parses
`output` with one analyzer per tool (`scripts/quality-report/analyzers/`), each tested against real
output of its tool. Mutation testing also prints a `MUTATION_RESULT: {json}` line, whose format is
shared by the mutation script and its analyzer (`scripts/shared/mutation-result.ts`).

**Adding an analysis.**

1. Add a value to `Analysis` (`scripts/quality-report/analysis.ts`), write an analyzer in
   `scripts/quality-report/analyzers/` with its tests, and add a `Check` to `SECTIONS`
   (`scripts/quality-report/sections.ts`).
2. Run the tool in its CI job as `node scripts/quality-report.ts run <analysis> -- <command>` and upload
   `quality-fragments/` as the `quality-fragment-<job>` artifact with `if: ${{ !cancelled() }}`.
3. Add the job to the `needs` of `quality-report`.

Render locally from fragments: `node scripts/quality-report.ts render --dir quality-fragments`.

## Configuration files

| File                                   | Description                                                           |
| -------------------------------------- | --------------------------------------------------------------------- |
| `package.json`                         | Extension manifest, npm scripts and dependencies.                     |
| `tsconfig.json` / `tsconfig.core.json` | Strict compiler options; the core checked without platform types.     |
| `src/webview/tsconfig.json`            | The webview checked with DOM types and React's JSX, without Node.js.  |
| `eslint.config.ts`                     | Lint, complexity and security rules.                                  |
| `.prettierrc.json`                     | Formatting.                                                           |
| `vitest.config.ts`                     | Unit tests (Node.js and jsdom projects) and the coverage ratchet.     |
| `vitest.integration.config.ts`         | Integration tests against real servers.                               |
| `test/integration/compose.yaml`        | MySQL, PostgreSQL and OpenSSH for the integration tests.              |
| `media/`                               | The activity bar icon.                                                |
| `.dependency-cruiser.mjs`              | Architecture contracts.                                               |
| `knip.jsonc`                           | Dead code analysis: entry points and project files.                   |
| `stryker.config.mjs`                   | Mutation testing scope and runner.                                    |
| `lefthook.yml`                         | Git hooks: pre-commit checks and the Conventional Commits check.      |
| `.npmrc`                               | npm never runs the install scripts of dependencies.                   |
| `scripts/`                             | Build, smoke launcher, mutation runner and the Quality Report.        |
| `.github/workflows/ci.yml`             | One job per group of analyses plus the `quality-report` job.          |
| `.github/workflows/mutation.yml`       | Mutation testing on PRs (changed files), weekly and on demand.        |
| `.github/dependabot.yaml`              | Grouped weekly updates with a cooldown, and the pinned exceptions.    |
| `.vscode/`                             | Launch configuration (F5), format on save and recommended extensions. |
| `CLAUDE.md` / `AGENTS.md`              | Rules for AI coding agents.                                           |
| `.claude/`                             | Claude Code agents, permissions and the format-and-lint hook.         |

## License

MIT, see [LICENSE](LICENSE).

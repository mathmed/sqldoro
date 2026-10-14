# Changelog

All notable changes to sqldoro are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and sqldoro follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Statements without a result set no longer open an empty grid.** An `UPDATE`, `ALTER TABLE` or
  `SET` run from an SQL editor shows its outcome in a line ("UPDATE: 3 rows affected · 12 ms",
  "ALTER TABLE done · 40 ms") in the result panel when one is open for the editor; otherwise it
  opens no panel and tells the outcome in a notification, and the query history keeps it as before.
  A script that also reads opens the panel at once with the grids of its queries and the outcomes
  of the other statements; a write that returns rows (`RETURNING`) and an error still open the panel,
  with the server's message.
- **Confirming a write no longer means typing.** An `UPDATE` or `DELETE` without a real `WHERE`, and
  any write on production, now ask once per run in a modal dialog that names the connection, its
  environment, the statements and their tables, with a button that runs them (**Run on Shop**,
  **Run the UPDATE of Every Row**); **Cancel** or `Escape` runs nothing. Typing stays for the
  riskiest case only: an `UPDATE` or `DELETE` of every row on production still waits for its table
  name. What needs a confirmation, read-only connections and the log are unchanged.
- **Following a link opens it in place.** In a table panel, the arrow of a foreign key cell,
  `Ctrl+Enter`, **Open Referenced Row** and the **Open** buttons of the peek and of the references
  show the rows in the same panel, with **Back** and the trail to return, as DB clients do.
  `Ctrl+click` (`Cmd+click`), a middle click on the arrow and **Open in New Tab** open them in a new
  panel. Changes not applied still ask before they are dropped. Links in the results of an SQL
  editor open a table panel, as before.

### Fixed

- **The autocomplete knows the statements of administration.** MySQL editors now suggest `FLUSH`
  and `PRIVILEGES`, and both dialects the first word of the statements of administration sqldoro's
  guards classify:
  `GRANT`, `REVOKE`, `ANALYZE`, `RENAME`, `LOCK`, `RESET`, `CALL`, `PREPARE`, `START TRANSACTION`,
  `SAVEPOINT`... with `KILL`, `OPTIMIZE`, `UNLOCK`, `PURGE`, `REPAIR`, `CHECKSUM`, `SHUTDOWN` on MySQL
  and `CHECKPOINT`, `CLUSTER`, `REINDEX`, `REFRESH`, `LISTEN`, `NOTIFY`, `MERGE` on PostgreSQL.

## [0.1.2] - 2026-10-13

### Added

- **Tooltips on every button of the result toolbar**: each names its action and its shortcut
  (**Preview Changes… (Ctrl+S)**, **Delete Rows (Delete)**, **Edit the Query (Ctrl+Shift+E)**), says
  why it is off when it is, and the **Sort and Filter on the Server** toggle says whether it is on.
  Buttons that are off keep their tooltip on hover, and screen readers hear the same names.

### Fixed

- **Editing MySQL rows no longer requires the server to be in strict mode.** sqldoro turns strict
  mode on in its own session for the apply only, then puts the session's `sql_mode` back: the
  server, other clients and the queries of the editor keep theirs, and a value a column cannot hold
  is still refused instead of cut.

## [0.1.1] - 2026-10-12

### Added

- **Save Query** button in the title bar of SQL editors, and **Save Query** on the statements of the
  query history.
- **Save Query As…** saves the editor of a saved query as a new one, which the editor edits from
  then on.

### Changed

- The **database and schema icons** of the explorer take the color of their connection (production
  in red, then the connection's color, then its environment's); the database of the SQL editor in
  front stays green.
- An editor opened from a saved query stays linked to it: **Save Query** updates its SQL in place,
  with no prompt, instead of asking for a name and creating a copy. Opening the same saved query
  again shows its editor.

### Fixed

- The caret of a table panel's **WHERE** field no longer drifts away from the colored text: the
  field now uses the same monospaced grid font as the text drawn under it (its placeholder too, like
  the query box's).

## [0.1.0] - 2026-10-12

The first version of sqldoro: a MySQL and PostgreSQL client for VS Code that makes the dangerous
statements hard and the everyday ones quick. Open source (MIT), with no telemetry.

### Added

- **Connections** to MySQL and PostgreSQL in a connection form: SSL/TLS (`disable`, `require`,
  `verify-ca`, `verify-full`, checked against the database host even through a tunnel), SSH tunnels
  with a password or private key (host keys trusted on first use), and passwords only in VS Code's
  secret storage.
- **Import a connection string** (`mysql://`, `postgres://`, `postgresql://`) in the form, and list
  the server's databases to pick one.
- **Environments** (`local`, `dev`, `staging`, `prod`, production in red), **colors** and
  **folders** (`clients/acme`) for connections. New connections are read-only.
- **Schema explorer**: databases, schemas, tables, views, columns, indexes and foreign keys, with
  colored icons, engine glyphs, server version, database sizes and estimated table rows and sizes.
- **The database of the SQL editor in front** stands out in the explorer, in green.
- **Find Table in Explorer** filters the explorer as you type, with fuzzy matching like VS Code's;
  **Go to Table…** (`Ctrl+Alt+T`) opens a table from a quick pick.
- **Table panels**: a click on a table opens its rows, with a **WHERE** condition (colored and
  completed) and a query box to edit and run the panel's whole query in place.
- **SQL editors** bound to a connection, database and schema, each on its own session: run a
  statement or a script, cancel on the server, errors underlined, schema-aware autocomplete.
- **Result grid**, virtualized in rows and columns: row numbers, sort, typed column filters (run on
  the server for tables, values bound), quick search, a columns panel, copy as TSV, CSV, JSON or
  `INSERT`, export to CSV, JSON or SQL, exact `BIGINT`, `DECIMAL` and dates, and a detail pane.
- **Foreign key navigation**: open, peek at or list the rows a row links to or is referenced by;
  table panels keep a trail with back and forward.
- **Inline editing** of one table's rows (enums picked from their values, sets from checkboxes):
  preview the exact statements and bound values, then apply in one transaction; a row changed
  meanwhile is a conflict, never overwritten.
- **Safety guards** on every statement: read-only connections (also read-only on the server),
  `UPDATE`/`DELETE` of every row and production writes confirmed by typing a name, manual
  transactions, an automatic `LIMIT` with **Load All Rows**, and a log without SQL text or values.
- **Tooling**: Show DDL, Explain and Explain Analyze, a query history per connection (passwords
  masked) and saved queries in folders with import and export.
- **Getting started** walkthrough, an About box on the safety model, and shortcuts to run, run a
  script and cancel.
- **Loading** that never blanks the view: a card with the time waited and **Cancel** after 300 ms,
  the previous rows dimmed meanwhile; reduced motion respected.
- **Logo**: a database cylinder with a `>_` prompt on a navy tile, as the extension icon.
- A reproducible `.vsix` that ships only what the extension needs, with the licenses of the bundled
  libraries in `ThirdPartyNotices.txt`; short README and contributor docs.

[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/mathmed/sqldoro/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mathmed/sqldoro/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mathmed/sqldoro/releases/tag/v0.1.0

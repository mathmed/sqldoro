# Changelog

All notable changes to sqldoro are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and sqldoro follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Connection form**, redesigned: a new connection starts on a card per database with its default
  port, then the connection shows in one card with a field per row and its label on the left: the
  environment as a segmented control with the color of each, host and port in one box, a password
  eye that only shows what you typed, the tunnel with its SSH fields just below, and the SSL/TLS
  certificates under **Advanced settings**. **Save connection** with problems opens the section of
  the first one and focuses it.

### Added

- **Import connection string** in the connection form: paste a URL to fill the fields, keeping the
  name you typed, the environment, the read-only switch and the tunnel. **Import Connection from
  URL** opens the form with that input instead of asking in an input box.
- **Databases of the server** in the connection form: the refresh button of the database field lists
  them, with the connection as typed, to pick one.

## [0.1.0] - Unreleased

The first version of sqldoro: a MySQL and PostgreSQL client for VS Code that makes the dangerous
statements hard and the everyday ones quick. Open source (MIT), with no telemetry.

### Added

- **Connections** to MySQL and PostgreSQL, saved in VS Code: SSL/TLS modes (`disable`, `require`,
  `verify-ca`, `verify-full`, certificates checked against the database host even through a
  tunnel), SSH tunnels with a password or a private key (host keys trusted on first use, a changed
  key refused unless trusted again), import from a `mysql://` or `postgres://` URL, environment tags
  (`local`, `dev`, `staging`, `prod`), and passwords kept only in the VS Code secret storage. New
  connections are read-only.
- **Schema explorer**: databases, schemas, tables and views, columns, indexes and foreign keys,
  loaded as nodes open, with a filter and refresh.
- **SQL editors** bound to a connection, database and schema, each on its own session: run the
  statement under the cursor or a whole script, cancel on the server, errors underlined where the
  server points, and schema-aware autocomplete.
- **Result grid**, virtualized in rows and columns: a million rows or a thousand columns scroll
  smoothly. Sort and filter (on the fetched rows, or on the server), select, copy as TSV, CSV, JSON
  or `INSERT`, export to CSV, JSON or SQL, `NULL` apart from the empty string, exact `BIGINT`,
  `DECIMAL` and dates, and a detail pane for long text, JSON and binary values.
- **Inline editing** of the rows of one table: changes stay pending until a preview shows the exact
  statements and their bound values, then apply in one transaction, all or nothing; a row changed
  by someone else meanwhile is reported as a conflict and never overwritten.
- **Safety guards** on every statement: read-only connections refused in sqldoro and opened
  read-only on the server; `UPDATE` and `DELETE` of every row held until the table name is typed;
  production writes held until the connection name is typed; manual transactions; an automatic
  `LIMIT` with **Load All Rows**; the environment shown in the status bar, the editor tab and the
  results; the decisions logged without SQL text or values.
- **Tooling**: Show DDL, Explain and Explain Analyze, a searchable query history per connection
  (passwords masked) and saved queries in folders with import and export.
- **Getting started** walkthrough, an About box that states the safety model and its limits, and
  keyboard shortcuts to run, run a script and cancel.
- A reproducible `.vsix` that ships only what the extension needs, with the licenses of the bundled
  libraries in `ThirdPartyNotices.txt`.

[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mathmed/sqldoro/releases/tag/v0.1.0

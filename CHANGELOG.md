# Changelog

All notable changes to sqldoro are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and sqldoro follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - Unreleased

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

[Unreleased]: https://github.com/mathmed/sqldoro/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/mathmed/sqldoro/releases/tag/v0.1.0

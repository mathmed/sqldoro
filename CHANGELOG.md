# Changelog

All notable changes to sqldoro are documented in this file. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and sqldoro follows
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **Loading of the results** is smooth: sorting, filtering, refreshing or navigating in place keeps
  the rows, toolbar and status on screen until the new rows replace them in one frame, instead of
  turning the rows into placeholders, flipping the toolbar to Cancel and back, or blanking the panel.
  A load under 300 ms shows nothing more; a longer one fades in a card with the time and Cancel (the
  rows of before dimmed, or a skeleton of the table on its first load) that stays at least 400 ms.
  Scrolling fast no longer flashes placeholders: the grid asks for the rows ahead, and rows not here
  yet stay blank for a moment. A new table panel shows its connection at once, and no "Run a query"
  text while it loads; its toolbar and status appear once, when the rows are read, and the card is no
  longer hidden behind the skeleton. Respects reduced motion.
- **Quick search** applies after its pause even when the view is drawn again while you type (it
  used to start the pause over).
- **Filters of the columns** take operators that suit the kind of the column (`=`, `≠`, `is null`
  and `is not null` for all; `contains`, `does not contain`, `starts with`, `ends with` for text;
  `<`, `≤`, `>`, `≥`, `between` for numbers and dates; `in` a list picked from the values of the
  column or of its enum) and several conditions, all of which apply. Values are compared exactly; on
  the server they are bound as parameters, cast to the type of the column. The rows of a table are
  always sorted and filtered on the server.
- **Connections in the explorer** show the environment, a lock when read-only and the server
  version; the host, user and database moved to the tooltip.
- **A colorful explorer**: each kind of node has an icon in a color of its own that follows the
  light, dark and high-contrast themes (databases gold, schemas purple, tables blue, views orange,
  columns in the color of fields, primary keys gold, indexes purple, foreign keys orange), and a
  failed list shows its error in red. A connection shows the glyph of its engine, with a green dot
  once connected; its color (production in red) now colors its name rather than its icon.
- **Read-only connections** are said once, by a lock beside the connection above the results, which
  offers **Allow Writes…**; the edit tools stay in the toolbar, off, saying why.
- The saved connections are written in a new version of their format (with their color and folder);
  an older sqldoro cannot read them.

- **Result view**, friendlier: the toolbar is a row of compact icon buttons with tooltips, in groups
  (refresh, changes, rows, cells, copy and export, reading), with the WHERE of a table and the quick
  search on the right; copy and export open a menu of their formats. Each column header shows the
  kind of its values, a filter button that opens the filter in a popover (instead of a row of
  filters under the headers) and lights up while the column is filtered, and a menu to sort
  ascending or descending, clear the sort, filter and copy the column name. The status of the
  statement and of the editing of its rows moves under the grid, and a run of one statement shows no
  tab bar (its statement is in the tooltip of the status). Table panels are titled
  `connection/database/table` (`schema.table` in PostgreSQL), with the environment after it.
- **Connection form**, redesigned: a new connection starts on a card per database with its default
  port, then the connection shows in one card with a field per row and its label on the left: the
  environment as a segmented control with the color of each, host and port in one box, a password
  eye that only shows what you typed, the tunnel with its SSH fields just below, and the SSL/TLS
  certificates under **Advanced settings**. **Save connection** with problems opens the section of
  the first one and focuses it.

### Added

- **The database the SQL editor in front runs on** stands out in the explorer: its icon and its name
  in green, with a `●` (in PostgreSQL its schema too), following the editor in front and its
  connection at once. With no SQL editor in front, each connection's default database is in green.
- **Refresh** as an inline button on database and schema rows, beside **New Query**.
- **Foreign key navigation**: a cell whose column is in a foreign key is a link. `Ctrl+click`
  (`Cmd+click`), its arrow or `Ctrl+Enter` opens the row it points at in a panel of its own;
  `Alt+click` opens it in place in a table panel, which keeps a trail of the steps as breadcrumbs,
  with back and forward (`Alt+Left`, `Alt+Right`) and each step's scroll and filters. A peek
  (resting on the arrow, or `Alt+Enter`) shows the row without leaving the grid. **References** lists
  the tables whose foreign keys point at a row, counts their rows on demand and opens them. Composite
  keys and PostgreSQL keys across schemas are followed.
- **Columns panel**: search, show and hide, invert, drag to reorder and reset the columns of the
  grid; **Hide column** in the menu of a header; `N columns hidden` under the grid opens it. A table
  panel remembers its columns per table, and copying and exporting take the columns shown.
- **Enums and sets**: their values in the tooltip of the header, in the filter and in the WHERE;
  a cell of an enum is edited by picking from its values, a set by checking them.
- **WHERE editor**: the condition of a table panel is colored as you type and completes the
  columns, the operators after a column and the values of an enum after `column =` (`Ctrl+Space`).
  Its expand button (or `Ctrl+Shift+E`) opens the query of the panel in an SQL editor.
- **Loading**: a statement that takes a moment shows a card with what it waits for, the time it has
  taken and **Cancel**; the rows of before stay, dimmed, until the new ones come; a slow list of the
  explorer says what loads.
- **Colors and folders** for connections: a color from the theme (production stays red) and a
  folder (`clients/acme`), with **Move to Folder…**, **Rename Folder…** and **Delete Folder**.
- **Find Table in Explorer** filters the explorer as you type across the connected connections, and
  **Go to Table…** (`Ctrl+Alt+T`, `Cmd+Alt+T`) opens a table picked from a quick pick.
- **Import connection string** in the connection form: paste a URL to fill the fields, keeping the
  name you typed, the environment, the read-only switch and the tunnel. **Import Connection from
  URL** opens the form with that input instead of asking in an input box.
- **Databases of the server** in the connection form: the refresh button of the database field lists
  them, with the connection as typed, to pick one.
- **Open table data**: a click on a table or view of the explorer (or its inline button, or the
  first entry of its context menu) opens its rows in a result panel of their own, without an SQL
  editor. The read goes through the guards with the automatic `LIMIT`, on a session of the panel's
  own, in auto-commit, and stays out of the query history; the rows of a table with a key can be
  edited, and **Refresh** reads them again in the same view.
- **Sizes, counts and server version in the explorer**: a connected connection shows the version of
  its server (`8.0.45`), each database its size (`2 GB`), the Tables and Views groups how many they
  hold once open (`142`, or `3 of 142` under a filter), and each table its estimated rows and size
  (`~27k rows · 32 MB`, the exact numbers in its tooltip). They come from the catalog statistics, in
  the query that already lists the objects; when the server cannot give them, the objects are listed
  without them. **Refresh** reads them again.
- **WHERE of a table panel**: a condition of your own (`status = 'active'`), applied with `Enter`,
  reads the rows of the table that meet it, through the guards and with the automatic `LIMIT`; the
  rows stay editable, and Refresh, Load All Rows and the server view keep the condition. A condition
  that would end the statement, or leave its strings, comments or parentheses open, is refused
  before anything runs.
- **Quick Search** in the result view: keeps the rows with a text in any column, without case, with
  the filters of the columns, and counts them. It searches the rows fetched, in the extension host.
- **Row numbers** in the result grid, always in view on the left: a click selects the row, `Shift`
  the rows up to it.

### Fixed

- **SSH tunnels** that cannot reach the database close the local connection cleanly instead of
  resetting it, so the client sees a closed connection rather than `ECONNRESET`.

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

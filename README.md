# sqldoro

[![CI](https://github.com/mathmed/sqldoro/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mathmed/sqldoro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.140-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![No telemetry](https://img.shields.io/badge/telemetry-none-brightgreen.svg)](#privacy)

A fast, safe MySQL and PostgreSQL client that lives inside VS Code. Open source (MIT), no telemetry,
built to make the dangerous queries hard and the everyday ones quick.

> [!NOTE]
> sqldoro 0.1.0 is the first version, and it is not on the Marketplace yet. Install the `.vsix` of a
> [release](https://github.com/mathmed/sqldoro/releases) (or the `sqldoro-vsix` artifact of a CI run)
> with **Extensions: Install from VSIX…**.

## Features

- **Connections** to MySQL and PostgreSQL, saved in VS Code, with SSL/TLS (`disable`, `require`,
  `verify-ca`, `verify-full`) and SSH tunnels (a password or a private key). The connection form opens
  in its own editor tab: a new connection starts on a card per database (with its default port), then
  the connection shows in one card, a field per row: the name, the environment and a **Read-only**
  switch, host and port in one box, the user, the password (its eye only ever shows what you typed),
  the database (typed, or picked from those the server lists), the tunnel with its SSH fields just
  below, and the SSL/TLS certificates under **Advanced settings**, which open by themselves when SSL is
  on or has a problem. Problems show as you type, **Save connection** takes you to the first one, and
  **Test** answers right in the form. Passwords and passphrases live only in VS Code's secret storage
  and never reach the form. **Import connection string** in the form (or **Import Connection from
  URL**) reads a `mysql://`, `postgres://` or `postgresql://` URL into the fields, keeping the name you
  typed, the environment, the read-only switch and the tunnel. Tag each connection with its
  environment (`local`, `dev`, `staging`, `prod`): it shows everywhere, production in red. Give a
  connection a color (its name in the explorer, the badge of its editors and the chip of its result
  panels take it; production is red whatever it is) and a folder (`clients/acme` nests folders):
  folders show as collapsible nodes, **Move to Folder…** moves a connection, and renaming or deleting a
  folder only moves the connections inside it. The explorer shows each connection with the glyph of
  its engine (a green dot once connected), the environment, a lock for a read-only connection and the
  server version; the host, user and database are in its tooltip.
- **Read-only by default**: a new connection refuses anything that may write, in sqldoro and in the
  database session, until you allow writes on it.
- **Schema explorer**: databases, schemas, tables and views, columns, indexes and foreign keys,
  loaded as you open them, with a filter by name, each kind with an icon in a color of its own that
  follows the theme. The database (and schema) the SQL editor in front runs on stands out in green,
  with a `●`; with no SQL editor in front, each connection's default database is in green. Database
  and schema rows offer **New Query** and **Refresh** as inline buttons. Click a table or view to open its rows in a result
  panel of their own (**Open Table Data**, also an inline button and the first entry of its context
  menu), named `connection/database/table` (`connection/database/schema.table` in PostgreSQL),
  without writing a query: sqldoro reads `SELECT * FROM` the table through the guards, with the
  automatic `LIMIT`, on a session of the panel's own, and **Refresh** reads the rows again. Type a
  condition in its **WHERE** box (`status = 'active'`) and press `Enter` to read only the rows that
  meet it: it is your own SQL, run through the guards like a query in an editor, kept one condition
  of one statement, and the rows stay editable. The **WHERE** colors the SQL as you type and suggests
  the columns of the table, the operators after a column and the values of an enum after
  `status =` (`Ctrl+Space` asks for them). Its expand button (or `Ctrl+Shift+E`, `Cmd+Shift+E`)
  shows the **query box** above the toolbar in its place: the whole query of the panel, exactly as it
  reads the rows (the columns shown, the WHERE, the filters and sort with their values written in, and
  the `LIMIT`), in an editable SQL box with the same colors and suggestions (plus the tables and views
  of the schema), `Tab` to indent. `Ctrl+Enter` (`Cmd+Enter`) or **Run** runs it, or the text selected
  in it, in place of the rows: one statement, through the guards like a query in an editor (a
  read-only connection refuses a write, production asks first, the automatic `LIMIT` applies), kept in
  the query history, with what it cost and its rows beside **Run**. Its result is a step of the trail
  (**Back** returns to the rows), sorted and filtered here, its links followed, and edited when it is
  still one table's rows. Its lower edge resizes it (the height is kept for the workspace); closing it
  (or `Ctrl+Shift+E` again) gives the WHERE back, and what you wrote stays for the next time.
  **Open in SQL Editor** (in **More Actions** at the end of the toolbar, or `↗` in the box) opens the
  query in a new SQL editor tab. The reads of the table itself are sqldoro's own: the query history
  does not keep them. Beside the names: the server version of a connected connection (`8.0.45`), the size
  of each database (`2 GB`), how many tables and views a group holds once it is open (`Tables 142`,
  or `3 of 142` under a filter), and the estimated rows and size of each table (`~27k rows · 32 MB`,
  exact numbers in its tooltip), read from the catalog statistics in the same query that lists them.
  **Refresh** reads them again. A node that takes a moment to load says so (`Loading tables…`).
  **Find Table in Explorer** (the magnifier in the title bar of the view) opens a box whose text
  filters the explorer as you type, on every keystroke, across every connected connection: the
  tables and views whose name matches show opened down to them, the matched characters
  highlighted, and the box counts them. Matching is like VS Code's: the text whole in the name
  first, then over the starts of its words (`trst` finds `transaction_status` and
  `TransactionStatus`), then its characters in order (`trsa` finds `Transaction`), the best matches
  first. The names load once, each database as it arrives, so typing never waits for the server.
  `Enter` opens the table that matches best and keeps the explorer filtered (**Clear Filter** gives
  the tree back); `Escape` gives the tree back as you left it. The box stays open while you work in
  the tree, and opens again on the text you left. **Filter Tables and Views**, in the Command
  Palette, keeps only the tables and views whose name contains a text. **Go to Table…**
  (`Ctrl+Alt+T`) lists the tables and views of the connected connections in a quick pick, filtered
  the same way, and opens the one you choose.
- **SQL editors** bound to a connection, database and schema, each on its own session: run the
  statement under the cursor or the whole script, cancel on the server, see errors underlined where
  the server points, and autocomplete databases, tables, columns (aliases too) and keywords.
- **A result grid that stays fast**, beside each SQL editor and for each table opened from the
  explorer: virtualized in rows and columns, so a million rows or a thousand columns scroll smoothly.
  Row numbers stay on the left (click one to select its row). Each header shows the kind of its
  column (`#` numbers, `abc` text, dates, booleans, `{}` JSON, binary), with the values of an enum and
  what a foreign key points at in its tooltip, a filter button that lights up while the column is
  filtered, and a menu to sort, filter, copy the column name and hide the column. The filter of a
  column offers the operators of its kind (`=`, `≠`, `is null`, `is not null` for all; `contains`,
  `does not contain`, `starts with`, `ends with` for text; `<`, `≤`, `>`, `≥`, `between` for numbers
  and dates; `in` a list picked from the values of the column or of its enum), and several
  conditions that all apply; values are compared exactly, and on the server they are bound as
  parameters. Sort and filter (on the rows already fetched, or on the server; always on the server for
  the rows of a table), and **Quick Search** for a text in any column. The **Columns** panel (also the
  `N columns hidden` note under the grid) searches, shows and hides, inverts and reorders the columns
  (drag, or `Alt+Up`/`Alt+Down`); a table panel remembers them for its table, and copying and
  exporting take the columns shown, in their order. While a statement runs, a card says what it waits
  for (connecting, running, fetching rows), how long it has taken, and cancels it; the rows of before
  stay, dimmed, until the new ones come. Compact icon buttons with tooltips refresh, cancel, apply and revert changes, add, duplicate
  and delete rows, copy the selection as CSV, JSON or `INSERT` statements (TSV with `Ctrl+C`), and
  export the result to CSV, JSON or SQL. `NULL` and the empty string look different, `BIGINT`,
  `DECIMAL` and dates are shown exactly as the server sent them, and long text, JSON and binary
  values open in a detail pane.
- **Foreign key navigation**: a cell whose column is in a foreign key is a link (underlined on hover,
  with an arrow). `Ctrl+click` (`Cmd+click`), its arrow or `Ctrl+Enter` opens the row it points at in
  a panel of its own; `Alt+click` opens it in place in a table panel, which keeps a trail of the steps
  (`Condominium #1 → CondominiumBankAccount (condominiumId = 1)`) with back and forward (`Alt+Left`,
  `Alt+Right`), each step keeping its scroll and filters. Resting the pointer on the arrow, or
  `Alt+Enter`, peeks at the row without leaving the grid. **References** (in the toolbar and the menu
  of a cell) lists the tables whose foreign keys point at the selected row, counts their rows on
  demand and opens them. Composite keys and PostgreSQL keys across schemas work; a `NULL` points
  nowhere and is no link.
- **Inline editing with an SQL preview**: change the rows of a table in the grid, add, duplicate and
  delete rows, then preview the exact statements and their bound values before anything is written.
  An enum is picked from its values, a set from checkboxes.
  The changes apply in one transaction, all or nothing, and a row someone changed meanwhile is
  reported as a conflict, never overwritten.
- **Safety guards** on every statement: an `UPDATE` or `DELETE` that reaches every row waits for its
  table name, a write on production waits for the connection name, manual transactions let you
  commit or roll back yourself, and queries that read get an automatic `LIMIT`. See
  [Safety model](#safety-model).
- **Tooling**: the DDL of tables and views, `EXPLAIN` and `EXPLAIN ANALYZE`, a searchable query
  history per connection, and saved queries in folders that you can import and export.
- **A walkthrough** to get started (**sqldoro: Get Started**) and an about box that states the safety
  model and what it cannot do.

## Getting started

1. Open the **sqldoro** view in the activity bar and select **Add Connection** (or **Import from
   URL**). Fill in the form that opens in an editor tab (the server type, then the host, port, user,
   password and database of **Main**; **SSL/TLS** and **SSH Tunnel** when you need them), then
   **Test Connection** and **Save**. New connections are read-only; tag production connections
   `prod`.
2. Click a table in the explorer to see its rows (type a condition in **WHERE** to narrow them),
   or select **New Query** on the connection, a database or a schema. Type a statement and press
   `Ctrl+Enter` (`Cmd+Enter` on macOS): the results open beside the editor.
3. To change data, run **Allow Writes** on the connection, open a table with a primary key (or run a
   plain `SELECT` of one table that includes it), edit cells in the grid and press `Ctrl+S` (`Cmd+S`)
   to preview the changes.

**sqldoro: Get Started** opens the walkthrough of these steps, and **sqldoro: About sqldoro and Its
Safety Model** recaps the guards. On Linux without a keyring (gnome-keyring, KWallet), VS Code may ask
how to store secrets: answer it, or start VS Code with `--password-store=basic`.

## Commands

Every command is in the Command Palette under **sqldoro:**, and in the menus of its view or of the SQL
editor where it applies.

| Command                                | Shortcut                                       | What it does                                                                                       |
| -------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Get Started**                        |                                                | Opens the walkthrough: first connection, first query, the safety model, editing rows.              |
| **About sqldoro and Its Safety Model** |                                                | Shows the version and a summary of the safety model and its limits.                                |
| **Add Connection**                     |                                                | Opens the form of a new connection on the databases to choose from: MySQL or PostgreSQL.           |
| **Import Connection from URL**         |                                                | Opens a new connection form on its input for a `mysql://`, `postgres://` or `postgresql://` URL.   |
| **Edit Connection**                    |                                                | Opens the form of a saved connection; its open session closes when a change affects it.            |
| **Duplicate Connection**               |                                                | Copies a connection and its secrets under a new name.                                              |
| **Delete Connection**                  |                                                | Deletes a connection with its secrets, after a confirmation.                                       |
| **Test Connection**                    |                                                | Connects, reports the server version and disconnects.                                              |
| **Connect** / **Disconnect**           |                                                | Opens or closes the session of a connection in the explorer.                                       |
| **Allow Writes**                       |                                                | Lets a read-only connection write, after a confirmation (the connection name typed on production). |
| **Make Read-Only**                     |                                                | Makes a connection read-only again.                                                                |
| **Refresh**                            |                                                | Reloads a node of the explorer, or all of it.                                                      |
| **Filter Tables and Views**            |                                                | Shows only the tables and views whose name contains some text (Command Palette).                   |
| **Find Table in Explorer**             |                                                | Opens a box whose text filters the explorer as you type; `Enter` opens the best match.             |
| **Go to Table…**                       | `Ctrl+Alt+T` (`Cmd+Alt+T`)                     | Lists the tables and views of the connected connections; the one picked opens its rows.            |
| **Move to Folder…**                    |                                                | Puts a connection in a folder (`clients/acme` nests folders), or takes it out of one.              |
| **Rename Folder…**                     |                                                | Renames a folder; its connections move with it.                                                    |
| **Delete Folder**                      |                                                | Removes a folder; its connections stay, out of it.                                                 |
| **Clear Filter**                       |                                                | Shows every table and view again, after a filter or a find.                                        |
| **Open Table Data**                    |                                                | Opens the rows of a table or view (a click on it in the explorer) in a result panel of their own.  |
| **Show DDL**                           |                                                | Opens the `CREATE` statement of a table or view (from the explorer).                               |
| **New Query**                          |                                                | Opens a SQL editor on a connection, database or schema.                                            |
| **Change Editor Connection**           |                                                | Binds the SQL editor to another connection, database or schema.                                    |
| **Run Query**                          | `Ctrl+Enter` (`Cmd+Enter`)                     | Runs the selection, or the statement under the cursor.                                             |
| **Run Script**                         | `Ctrl+Alt+Enter` (`Cmd+Alt+Enter`)             | Runs every statement of the editor in order, and stops at the first error.                         |
| **Cancel Query**                       | `Ctrl+Shift+Backspace` (`Cmd+Shift+Backspace`) | Stops the running statement on the server (also from the status bar).                              |
| **Explain Query**                      |                                                | Shows the plan of the statement.                                                                   |
| **Explain Analyze Query**              |                                                | Runs a statement that only reads and measures each step, after a confirmation.                     |
| **Show Results**                       |                                                | Shows the result view of the SQL editor.                                                           |
| **Switch Transaction Mode**            |                                                | Switches the editor between auto-commit and manual transactions.                                   |
| **Commit Transaction**                 |                                                | Commits the transaction open in the editor.                                                        |
| **Roll Back Transaction**              |                                                | Rolls back the transaction open in the editor.                                                     |
| **Search Query History**               |                                                | Finds a statement you ran, by its text.                                                            |
| **Open in Editor**                     |                                                | Opens a statement of the history in a SQL editor.                                                  |
| **Run Again**                          |                                                | Runs a statement of the history again, through the guards.                                         |
| **Copy SQL**                           |                                                | Copies a statement of the history.                                                                 |
| **Delete from History**                |                                                | Removes a statement from the history.                                                              |
| **Clear Query History**                |                                                | Removes every statement of the history.                                                            |
| **Save Query**                         |                                                | Saves the selection, or the whole editor, as a named query in a folder.                            |
| **Open Saved Query**                   |                                                | Opens a saved query in a SQL editor.                                                               |
| **Insert Saved Query**                 |                                                | Inserts a saved query at the cursor.                                                               |
| **Rename Saved Query**                 |                                                | Renames a saved query.                                                                             |
| **Move Saved Query to Folder**         |                                                | Moves a saved query to another folder.                                                             |
| **Delete Saved Query**                 |                                                | Deletes a saved query.                                                                             |
| **Import Saved Queries**               |                                                | Adds the saved queries of a JSON file.                                                             |
| **Export Saved Queries**               |                                                | Writes every saved query to a JSON file.                                                           |
| **Hello**                              |                                                | Says hello: a quick way to check that the extension runs.                                          |

### In the result grid

| Keys                                        | What they do                                                                      |
| ------------------------------------------- | --------------------------------------------------------------------------------- |
| Arrows, `Page Up`/`Page Down`, `Home`/`End` | Move the cell selection; `Shift` extends it; `Ctrl+Home`/`Ctrl+End` go to ends.   |
| Click a row number                          | Selects the row; `Shift` selects the rows from the selection to it.               |
| Click a column name                         | Sorts by the column, ascending first; `Shift` adds it to the sort.                |
| `Ctrl+A` (`Cmd+A`)                          | Selects every cell.                                                               |
| `Ctrl+C` (`Cmd+C`)                          | Copies the selected cells as TSV.                                                 |
| `Enter`, double click                       | Edits the cell when the rows can be edited, or opens its whole value.             |
| `F2`, or typing                             | Edits the cell.                                                                   |
| `Enter`, `Shift+Enter`, `Tab`, `Escape`     | In a cell being edited: put the value in, add a new line, move on, cancel.        |
| `Delete`                                    | Marks the selected rows for deletion.                                             |
| `Ctrl+S` (`Cmd+S`)                          | Previews the pending changes.                                                     |
| `Enter`, `Escape`                           | In the filter of a column: apply it, close it; the focus goes back to the header. |
| `Enter`, `Escape`                           | In **Quick Search**: search at once (it also searches as you pause), clear it.    |
| `Enter`                                     | In the **WHERE** of a table: read the rows that meet the condition.               |
| `Ctrl+Space`, `Tab`                         | In the **WHERE** of a table: suggest columns, operators and values; take one.     |
| `Ctrl+Shift+E` (`Cmd+Shift+E`)              | In a table panel: show its query box in place of the WHERE, or the WHERE again.   |
| `Ctrl+Enter` (`Cmd+Enter`), `Tab`           | In the query box: run the query (or the selection); indent.                       |
| `Ctrl+click`, `Ctrl+Enter` (`Cmd`)          | On a link: open the row it points at in a panel of its own.                       |
| `Alt+click`                                 | On a link in a table panel: open the row it points at in place.                   |
| `Alt+Enter`                                 | On a link: peek at the row it points at.                                          |
| `Alt+Left`, `Alt+Right`                     | In a table panel: go back and forward along its trail.                            |
| Menu key, `Shift+F10`, right click          | Open the menu of a cell: its link, the rows that reference its row, copy.         |

The filter of a column keeps the rows that meet all of its conditions (text searches ignore case).
**Quick Search** keeps the rows with its text in any column, with the filters of the columns, and
counts them. Both run in the extension host over the rows sqldoro fetched: on a result cut by the
automatic limit, **Load All Rows** first to search every row (the filters of the columns can also
run on the server, and always do for the rows of a table). Copying and exporting take the rows as
the grid shows them, in the columns shown and their order; **Copy Rows as INSERT** takes every
column, to write the rows whole.

## Settings

| Setting                                   | Default    | Description                                                                   |
| ----------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `sqldoro.results.maxRows`                 | `100000`   | Rows kept of a result (1 to 5,000,000); past it the result is flagged as cut. |
| `sqldoro.history.maxEntriesPerConnection` | `500`      | Statements the query history keeps per connection; the oldest go first.       |
| `sqldoro.autoLimit.enabled`               | `true`     | Give queries without a limit of their own the automatic `LIMIT`.              |
| `sqldoro.autoLimit.rows`                  | `1000`     | Rows the automatic limit keeps (never more than `results.maxRows`).           |
| `sqldoro.safety.productionEnvironments`   | `["prod"]` | Environment tags treated as production; `prod` always is.                     |
| `sqldoro.transactions.defaultMode`        | `"auto"`   | Transaction mode of new SQL editors: `auto` (auto-commit) or `manual`.        |

Settings can only make the guards stricter: there is no setting to turn off the read-only, every-row
or production guards.

## Safety model

sqldoro makes the dangerous statements hard in layers. Each layer is honest about what it cannot do:
**the guarantee is the permissions of the database user**. Connect with a user that has only the
grants the work needs (a read-only role for browsing production), and treat the layers below as
seat belts, not as access control.

**One gate for every statement.** Whatever runs a statement (Run Query, Run Script, the history, a
saved query opened in an editor, EXPLAIN and EXPLAIN ANALYZE, the rows of a table opened from the
explorer, their Refresh and their WHERE, sorting on the server, Load All Rows, and the changes
applied from the grid) goes through the same guard before anything runs: it classifies each
statement, applies the rules of the connection, asks for the confirmations they need and logs the
decision. A script is checked whole before its first statement runs, and the runner refuses any
statement the guard did not see. Only sqldoro's own statements bypass it: the catalog queries of the explorer,
`START TRANSACTION`, `COMMIT`, `ROLLBACK`, the savepoint of an apply that joins an open transaction
(`SAVEPOINT`, `RELEASE SAVEPOINT`, `ROLLBACK TO SAVEPOINT`) and the transaction status probe.

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

| Guard                            | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read-only connections            | Refuse every statement that is not a read or transaction control (`SET`, `CALL`, unknown statements and `BEGIN READ WRITE` included), with a message and an **Allow Writes…** button. Allowing writes is a setting of the connection, confirmed on its own (typed on production); it never re-runs the statement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Read-only sessions               | The second layer: sessions of a read-only connection are opened read-only by the database (`SET default_transaction_read_only = on` in PostgreSQL, on every database the session opens; `SET SESSION TRANSACTION READ ONLY` in MySQL), so a write the classifier misses (a function that writes, a procedure) fails on the server. A statement could switch this off again (`SET`, `set_config`), which is why the classifier blocks those on read-only connections; server permissions remain the real guarantee. MySQL still lets a read-only transaction change `TEMPORARY` tables.                                                                                                                                                                                                               |
| `UPDATE` / `DELETE` of every row | An `UPDATE` or `DELETE` (also inside a `WITH` query or under `EXPLAIN ANALYZE`) without its own `WHERE`, or whose `WHERE` is always true (`1 = 1`, `true`, a constant, `id = id`, an `OR` with such a branch), is held until the table name is typed, once, for that run; the override is logged. A `WHERE` inside a subquery does not count. A `JOIN ... ON` or `LIMIT` without `WHERE` is still held.                                                                                                                                                                                                                                                                                                                                                                                              |
| Production                       | Connections tagged with an environment of `sqldoro.safety.productionEnvironments` (`prod` always) ask for the connection name to be typed before any write, DDL, session or unknown statement, once per run; reads and transaction control run at once. Tagging a connection as production makes it read-only; the status bar turns red, the editor tab shows the badge and the result view a red chip above the results.                                                                                                                                                                                                                                                                                                                                                                            |
| Manual transactions              | **Switch Transaction Mode** (status bar) per editor; `sqldoro.transactions.defaultMode` sets the mode of new editors. In manual mode the first statement opens a transaction (read-only on read-only connections) that stays open until **Commit Transaction** or **Roll Back Transaction**. After each statement sqldoro asks the server whether a transaction is open, so a transaction you open with `BEGIN`, one that DDL committed in MySQL, one a deadlock rolled back or one PostgreSQL aborted after an error all show as they are. Before DDL runs in a MySQL transaction, sqldoro warns that it commits. Closing the last tab of an editor with an open transaction asks to commit or roll back; closing the document, disconnecting or changing the connection rolls it back and says so. |
| Automatic `LIMIT`                | A `SELECT`, `WITH` or `TABLE` query that only reads and has no `LIMIT`, `FETCH` or `TOP` of its own gets `LIMIT n + 1` after its last token, and the result says **limited to n rows** with **Load All Rows**, which runs it again without the automatic limit. Where appending is not safe (an `OFFSET`, MySQL executable comments) the driver stops reading after n rows instead. Statements that write, `EXPLAIN`, `SHOW` and queries already limited at their top level run as written.                                                                                                                                                                                                                                                                                                          |

**What the guards cannot do.** They are not access control. The classifier cannot see inside
procedures, triggers and functions; a connection you allowed to write writes; a confirmation you type
lets the statement through; and on a writable connection anything the database user may do, sqldoro
can do. Use database users with the least privilege the work needs, keep production connections
tagged `prod` (and read-only unless you are changing data on purpose), and prefer a read replica or a
read-only role for browsing production.

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
  meanwhile is a conflict, reported on that row, never overwritten.
- **The guard.** The statements of an apply, and the query that reads the rows again, go through the
  guard like typed SQL: blocked on read-only connections, the connection name typed on production,
  the decision logged. Deleting rows also asks for their number: typed on production, a button
  elsewhere.
- **The transaction.** An apply runs in a transaction of its own and commits only if every statement
  changed exactly the row it had to; a failure, a conflict or any other count rolls everything back,
  and the result says which row stopped it and why. In manual mode, or when the editor has a
  transaction open, the apply runs inside a savepoint of it, and committing stays yours. A table
  opened from the explorer always runs in auto-commit, so its changes apply in a transaction of their
  own. MySQL edits need strict SQL mode, so that a value the column cannot hold is refused instead of
  cut.

## Known limits

- **Editing**: at most 1,000 changed rows per apply; views, binary and spatial values are read-only;
  dates and times are written and compared as the server shows them, in the time zone of the session;
  the statements of an apply are not kept in the history (they hold the values written).
- **Large results**: sqldoro keeps up to `sqldoro.results.maxRows` rows in the extension host's
  memory; sorting, filtering or searching a million of them there takes under a second, during which
  the extension host is busy. **Quick Search** only searches the rows fetched. The detail pane shows
  the first 200,000 characters of a value: copy the cell or export the result to get all of it.
- **Connections**: no SSH agent, jump hosts or passphrase-protected TLS client keys; passwords are
  saved, not asked every time. sqldoro is tested against MySQL 8.4 and PostgreSQL 18; MariaDB, other
  MySQL- or PostgreSQL-compatible servers and older versions should work but are not tested.
- **Explorer statistics**: row counts are the server's estimates, as fresh as its last analysis
  (MySQL caches them for a day by default, until `ANALYZE TABLE`; PostgreSQL updates them with
  `ANALYZE` and autovacuum, and shows none for a table never analyzed). A database whose size the user
  may not see (PostgreSQL without the `CONNECT` privilege) shows none; when the server cannot give
  the statistics at all, the objects are listed without them and the output says why (debug level).
  In PostgreSQL, reading a table's size waits for an `ACCESS EXCLUSIVE` lock on it (a long
  `ALTER TABLE`, `VACUUM FULL`), so its schema's tables list once that lock is gone.
- **Navigation and finding tables**: links follow the foreign keys the catalog declares, on result
  columns the server traces back to their table (not on expressions); a key the result does not hold
  whole is no link. MySQL foreign keys across databases are followed but not covered by the
  integration tests. **Find Table in Explorer** and **Go to Table…** list, in PostgreSQL, the
  database of the connection (or, without one, its first 10 databases).
- **Editors**: an untitled SQL editor restored after VS Code restarts asks for its connection again,
  on purpose; files keep theirs. Cancelling MySQL's `SELECT SLEEP(n)` returns a row (that is what an
  interrupted `SLEEP` does) instead of showing the query as cancelled.

## Out of scope for v1

ER diagrams, schema diff, data compare, an import wizard, NoSQL databases, engines other than MySQL
and PostgreSQL, an MCP server, and telemetry.

## Privacy

sqldoro has no telemetry, ever: no analytics, no crash reports, no network calls other than the
connections you configure to your own databases and SSH servers. Connection settings live in VS
Code's storage for the extension (not synced), secrets only in its secret storage, and the query
history and saved queries on your machine.

## Contributing

Contributions are welcome. [`CONTRIBUTING.md`](CONTRIBUTING.md) explains how to run sqldoro locally,
what each check of the pipeline guarantees and how to add a database engine;
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) shows the layers and the guard layer;
[`docs/RELEASING.md`](docs/RELEASING.md) describes releases; [`CHANGELOG.md`](CHANGELOG.md) lists
what changed. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md), and report security problems
as [`SECURITY.md`](SECURITY.md) says, privately.

## License

MIT, see [LICENSE](LICENSE). The libraries bundled into the extension are listed with their licenses
in `ThirdPartyNotices.txt`, inside the package.

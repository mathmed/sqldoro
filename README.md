<p align="center"><img src="media/icon.png" width="128" alt="sqldoro logo"></p>

<h1 align="center">sqldoro</h1>

<p align="center">
MySQL and PostgreSQL client for VS Code: schema explorer, SQL editor, fast result grid and safe
inline editing. Read-only by default, no telemetry.
</p>

<p align="center">
<a href="https://github.com/mathmed/sqldoro/actions/workflows/ci.yml"><img src="https://github.com/mathmed/sqldoro/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
<a href="https://github.com/mathmed/sqldoro/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License: MIT"></a>
<a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-%5E1.140-007ACC?logo=visualstudiocode" alt="VS Code ^1.140"></a>
<a href="#privacy"><img src="https://img.shields.io/badge/telemetry-none-brightgreen.svg" alt="No telemetry"></a>
</p>

sqldoro is an open-source (MIT) database client that lives inside VS Code. It makes the dangerous
statements hard and the everyday ones quick.

## Install

sqldoro 0.1.0 is not on the Marketplace yet: download the `.vsix` of a
[GitHub release](https://github.com/mathmed/sqldoro/releases) and run **Extensions: Install from
VSIX…**. It needs VS Code 1.140 or later.

## Features

- **Connections** to MySQL and PostgreSQL, with SSL/TLS and SSH tunnels (password or private key),
  import from a URL, environment tags (`prod` in red), colors and folders. Passwords live only in
  VS Code's secret storage.
- **Schema explorer**: databases, schemas, tables, views, columns, indexes and foreign keys, with
  server version, sizes and estimated row counts. **Find Table in Explorer** and **Go to Table…**
  find a table by fuzzy name.
- **Table data**: click a table to open its rows, narrow them with a **WHERE** condition, or edit and
  run the panel's whole query in the query box above the rows.
- **SQL editors** bound to a connection, database and schema, each on its own session: run the
  statement under the cursor or a script, cancel on the server, errors underlined, autocomplete.
  Statements without a result set (`UPDATE`, `ALTER TABLE`) show their outcome ("UPDATE: 3 rows
  affected · 12 ms") in the result panel when it is open, in a notification otherwise: no empty
  grid.
- **Result grid**, virtualized in rows and columns (a million rows scroll smoothly): sort, column
  filters, quick search, show, hide and reorder columns, copy and export to CSV, JSON or SQL. `NULL`,
  `BIGINT`, `DECIMAL` and dates are shown exactly as the server sent them.
- **Foreign key navigation**: follow a link to the row it points at, peek at it, or list the rows
  that reference a row. In a table panel a link opens in place, like a link of a browser, with a
  trail to go back and forward; `Ctrl+click`, a middle click or **Open in New Tab** opens it in a
  new panel.
- **Inline editing** of one table's rows: preview the exact SQL and bound values, then apply in one
  transaction; a row someone else changed is reported as a conflict, never overwritten.
- **Tooling**: DDL, `EXPLAIN` and `EXPLAIN ANALYZE`, and a query history per connection.
- **Saved queries** in folders, with import and export: **Save Query** in the title bar of a SQL
  editor (or on a statement of the history) names the query and picks its folder. An editor opened
  from a saved query stays linked to it: **Save Query** updates it in place, **Save Query As…** keeps
  a copy under a new name.

## Getting started

1. Open the **sqldoro** view in the activity bar and select **Add Connection**. Fill in the form,
   **Test**, then **Save connection**. New connections are read-only; tag production ones `prod`.
2. Click a table to see its rows, or select **New Query** on a connection, database or schema, type a
   statement and press `Ctrl+Enter` (`Cmd+Enter`).
3. To change data, run **Allow Writes** on the connection, edit cells of a table with a primary key
   and press `Ctrl+S` (`Cmd+S`) to preview the changes.

**sqldoro: Get Started** opens a walkthrough of these steps. On Linux without a keyring, start VS
Code with `--password-store=basic` if it cannot store secrets.

## Commands

Every command is in the Command Palette under **sqldoro:** and in the menus where it applies.

| Commands                                                                                                                    | Shortcut                                       | What they do                                                                                |
| --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Get Started**, **About sqldoro and Its Safety Model**, **Hello**                                                          |                                                | Open the walkthrough, show the safety model and its limits, check that sqldoro runs.        |
| **Add Connection**, **Import Connection from URL**, **Edit Connection**                                                     |                                                | Open the connection form: new, from a `mysql://` or `postgres://` URL, or saved.            |
| **Test Connection**, **Duplicate Connection**, **Delete Connection**                                                        |                                                | Test a connection, copy it with its secrets, or delete it after confirming.                 |
| **Connect** / **Disconnect**, **Refresh**                                                                                   |                                                | Open or close the session of a connection; reload a node of the explorer.                   |
| **Allow Writes**, **Make Read-Only**                                                                                        |                                                | Let a read-only connection write (after confirming), or make it read-only again.            |
| **Move to Folder…**, **Rename Folder…**, **Delete Folder**                                                                  |                                                | Group connections in folders (`clients/acme` nests); deleting a folder keeps them.          |
| **Find Table in Explorer**, **Filter Tables and Views**, **Clear Filter**                                                   |                                                | Filter the explorer by table name, as you type or by a text, and clear the filter.          |
| **Go to Table…**                                                                                                            | `Ctrl+Alt+T` (`Cmd+Alt+T`)                     | Pick a table or view and open its rows.                                                     |
| **Open Table Data**, **Show DDL**                                                                                           |                                                | Open the rows of a table or view, or its `CREATE` statement.                                |
| **New Query**, **Change Editor Connection**                                                                                 |                                                | Open a SQL editor on a connection, database or schema, or bind it to another.               |
| **Run Query**                                                                                                               | `Ctrl+Enter` (`Cmd+Enter`)                     | Run the selection, or the statement under the cursor.                                       |
| **Run Script**                                                                                                              | `Ctrl+Alt+Enter` (`Cmd+Alt+Enter`)             | Run every statement in order; stop at the first error.                                      |
| **Cancel Query**                                                                                                            | `Ctrl+Shift+Backspace` (`Cmd+Shift+Backspace`) | Stop the running statement on the server.                                                   |
| **Explain Query**, **Explain Analyze Query**                                                                                |                                                | Show the plan; run a read-only statement and measure it, after confirming.                  |
| **Show Results**                                                                                                            |                                                | Show the result view of the SQL editor.                                                     |
| **Switch Transaction Mode**, **Commit Transaction**, **Roll Back Transaction**                                              |                                                | Switch an editor between auto-commit and manual; commit or roll back.                       |
| **Search Query History**, **Open in Editor**, **Run Again**, **Copy SQL**, **Delete from History**, **Clear Query History** |                                                | Search the history; open, run again, copy, save or delete a statement; clear it.            |
| **Save Query**, **Save Query As…**                                                                                          |                                                | Save the selection or the editor as a named query; update the query the editor opened from. |
| **Open Saved Query**, **Insert Saved Query**, **Rename Saved Query**                                                        |                                                | Open a saved query in an editor linked to it; insert or rename one.                         |
| **Move Saved Query to Folder**, **Delete Saved Query**, **Import Saved Queries**, **Export Saved Queries**                  |                                                | Organize saved queries, and import or export them as JSON.                                  |

### Keys in the result view

| Keys                                    | What they do                                                                 |
| --------------------------------------- | ---------------------------------------------------------------------------- |
| `Enter`, `F2` or typing                 | Edit the cell; on rows that cannot be edited, `Enter` opens its whole value. |
| `Delete`                                | Mark the selected rows for deletion.                                         |
| `Ctrl+S` (`Cmd+S`)                      | Preview the pending changes.                                                 |
| `Ctrl+C` (`Cmd+C`)                      | Copy the selected cells as TSV.                                              |
| `Ctrl+Enter` (`Cmd+Enter`), `Alt+click` | On a link: open the row it points at in place (in a table panel).            |
| `Ctrl+click` (`Cmd+click`)              | On a link: open the row it points at in a new panel.                         |
| `Alt+Enter`                             | On a link: peek at the row it points at.                                     |
| `Alt+Left`, `Alt+Right`                 | In a table panel: back and forward along the trail.                          |
| `Ctrl+Shift+E` (`Cmd+Shift+E`)          | In a table panel: switch between the WHERE and the query box.                |
| `Ctrl+Space`                            | In the WHERE or the query box: suggest columns and values.                   |

## Settings

| Setting                                   | Default    | Description                                                        |
| ----------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `sqldoro.results.maxRows`                 | `100000`   | Rows kept of a result (1 to 5,000,000); past it the result is cut. |
| `sqldoro.history.maxEntriesPerConnection` | `500`      | Statements the query history keeps per connection.                 |
| `sqldoro.autoLimit.enabled`               | `true`     | Give queries without a limit of their own the automatic `LIMIT`.   |
| `sqldoro.autoLimit.rows`                  | `1000`     | Rows the automatic limit keeps (at most `results.maxRows`).        |
| `sqldoro.safety.productionEnvironments`   | `["prod"]` | Environment tags treated as production; `prod` always is.          |
| `sqldoro.transactions.defaultMode`        | `"auto"`   | Transaction mode of new SQL editors: `auto` or `manual`.           |

Settings can only make the guards stricter: none turns off the read-only, every-row or production
guards.

## Safety model

Every statement (typed, from the history, from a table panel or generated by the grid) goes through
one guard before it runs. The guards are seat belts, not access control: **the real guarantee is the
permissions of the database user**, so connect with the least privilege the work needs.

- **Read-only by default**: a read-only connection refuses anything that is not a read, and its
  sessions are also opened read-only on the server, which catches what the classifier cannot see
  (procedures, triggers, functions).
- **Confirmations**: an `UPDATE` or `DELETE` without a real `WHERE`, and any write on production,
  wait for a modal dialog that names the connection, its environment, the statements and their
  tables: one dialog per run, run with its button (**Run on Shop**, **Run the UPDATE of Every
  Row**), refused with **Cancel** or `Escape`. Only the riskiest case, an `UPDATE` or `DELETE` of
  every row on production, also asks for the table name to be typed.
- **Production** connections (tagged `prod`) start read-only and show in red in the status bar, the
  editor tab and the results.
- **Automatic `LIMIT`** on queries that read; **Load All Rows** runs them again without it.
- **Manual transactions** per editor: commit or roll back yourself; sqldoro asks the server whether
  a transaction is open after each statement.
- **Editing previews the SQL**: the exact statements and bound values, applied in one transaction
  that rolls back on any failure or conflict.
- **The log** (`sqldoro` output channel) records each decision with the connection, verbs and
  tables, never SQL text, values or credentials.

The classifier is best effort and fails closed: a statement it cannot read counts as a write.

## Known limits

- Editing needs one `SELECT` of plain columns from one table with a primary or unique key; at most
  1,000 changed rows per apply; views, binary and spatial values are read-only.
- Results are held in the extension host's memory, up to `sqldoro.results.maxRows`; **Quick Search**
  only searches the rows fetched.
- No SSH agent, jump hosts or passphrase-protected TLS client keys. Tested against MySQL 8.4 and
  PostgreSQL 18; compatible servers and older versions should work but are not tested.
- Explorer row counts are the server's estimates.
- Out of scope for v1: ER diagrams, schema diff, data compare, an import wizard, NoSQL and other
  engines, an MCP server, and telemetry.

## Privacy

No telemetry, ever: no analytics, no crash reports, no network calls other than your own databases
and SSH servers. Connection settings live in VS Code's storage for the extension, secrets in its
secret storage, and the history and saved queries on your machine.

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md), [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md),
[`docs/RELEASING.md`](docs/RELEASING.md) and [`CHANGELOG.md`](CHANGELOG.md). Follow the
[Code of Conduct](CODE_OF_CONDUCT.md), and report security problems privately as
[`SECURITY.md`](SECURITY.md) explains.

## License

MIT, see [LICENSE](LICENSE). The bundled libraries and their licenses are listed in
`ThirdPartyNotices.txt` inside the package.

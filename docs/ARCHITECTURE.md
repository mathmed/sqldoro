# Architecture

sqldoro is a VS Code extension in strict TypeScript, in five layers with one rule: dependencies point
inward, to the core. The rules below are not conventions only: `make lint-arch` (dependency-cruiser,
`.dependency-cruiser.mjs`) fails on an import that breaks them, `make typecheck` checks the core
without Node.js or DOM types, and `src/extension/safety/guarded-execution.test.ts` fails on any new
place that runs SQL.

## Layers

```mermaid
flowchart TB
  subgraph host["VS Code extension host (Node.js)"]
    extension["src/extension<br/>activation, commands, views, editors,<br/>result panels, SecretStorage, settings"]
    factories["src/extension/factories<br/>composition root"]
    drivers["src/drivers<br/>mysql/ (mysql2) · postgres/ (pg)"]
    tunnel["src/tunnel<br/>SSH tunnel (ssh2)"]
  end
  subgraph browser["Webviews (browser sandbox, strict CSP)"]
    webview["src/webview<br/>React: the result grid (TanStack Table and Virtual)<br/>and the connection form (connection-form/)"]
  end
  core["src/core<br/>engine and tunnel interfaces, connection model,<br/>SQL lexing, safety guards, edits, result model,<br/>message protocol: pure TypeScript"]

  extension --> core
  factories --> drivers
  factories --> tunnel
  extension --> factories
  drivers --> core
  tunnel --> core
  webview --> core
  extension <-. "messages (protocol.ts),<br/>checked on both sides" .-> webview
```

- **`src/core`** is pure TypeScript: no `vscode`, no Node.js built-ins (it also runs in the webview),
  no database, SSH or UI library. Platform services reach it through interfaces it declares (`Engine`,
  `EngineSession`, `TunnelOpener`, `Logger`, the file reader). Invariants, calculations and state
  transitions live here as pure functions: the statement classifier, the guard policy, the
  automatic `LIMIT`, the transaction state machine, what can be edited and the statements of an
  edit, the result model and the parsers of every message.
- **`src/drivers`** has one folder per database, each implementing `Engine` with its own client
  library only. Drivers never import each other, the tunnel, `vscode`, the extension host or the
  webview.
- **`src/tunnel`** implements the core tunnel interface with `ssh2` and Node.js.
- **`src/extension`** is the VS Code side. It talks to databases only through the core interfaces;
  only `src/extension/factories/` instantiates the drivers and the tunnel, so supporting another
  engine is writing its driver and registering it there (see
  [CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-database-engine)).
- **`src/webview`** holds the two webviews, each a browser bundle of its own (Vite): the result grid
  and the connection form. They never import the extension host. The grid holds no rows of its own
  beyond a bounded cache: the host keeps the rows, and sorts, filters, copies and exports them.

## Opening a session

```mermaid
sequenceDiagram
  participant UI as Command or editor
  participant SM as SessionManager / EditorSessions
  participant SS as SecretStore
  participant OS as openSession (core)
  participant T as TunnelOpener (src/tunnel)
  participant KH as KnownHosts
  participant D as Engine (driver)
  UI->>SM: connect(connection)
  SM->>SS: read secrets (10 s timeout)
  SM->>OS: open(connection, secrets)
  OS->>OS: read certificate files
  opt SSH tunnel
    OS->>T: open(ssh options)
    T->>KH: verify host key (trust on first use)
    KH-->>T: trusted or refused
    T-->>OS: local endpoint 127.0.0.1:port
  end
  OS->>D: connect(endpoint, tls with the database host name, isReadOnly)
  D-->>OS: EngineSession (read-only on the server when asked)
  OS-->>SM: Session (closes the driver, then the tunnel)
```

The driver dials whatever endpoint it is given: it never knows about SSH, and certificates are always
checked against the database host name, also through the tunnel. Errors are redacted of the secrets
the session was opened with before they reach the screen or the log. Each SQL editor runs on its own
session, so a long query never blocks another editor or the explorer; the explorer and the
autocomplete share one session per connection.

## The guard layer

Every statement a user or the grid runs goes through one gate. A run declares every statement it may
execute in a `RunWork`; `QueryRunner.perform` hands them to `StatementGuard`, which decides before
anything runs, and `QueryRunner.runJob` refuses any SQL the guard did not approve.

```mermaid
flowchart TB
  sources["Run Query · Run Script · history · saved query in an editor ·<br/>EXPLAIN / EXPLAIN ANALYZE · sort on the server · Load All Rows ·<br/>a table opened from the explorer, its Refresh and its WHERE ·<br/>apply the edits of the grid"]
  sources --> work["RunWork: every statement the run may execute"]
  work --> perform["QueryRunner.perform"]
  perform --> classify["classify each statement (core, with the dialect's lexical rules):<br/>read · write · DDL · transaction · session · unknown (fails closed)<br/>+ every-row UPDATE / DELETE"]
  classify --> policy["guard policy (core): connection read-only? production?"]
  policy -->|"read-only and not a read"| block["blocked, with Allow Writes…<br/>(a separate, confirmed setting change)"]
  policy -->|"every-row UPDATE / DELETE"| typeTable["type the table name"]
  policy -->|"write on production"| typeName["type the connection name"]
  policy -->|"allowed"| approval
  typeTable --> approval["approval: the statements and their classes"]
  typeName --> approval
  approval --> runJob["runJob / edit-batch: refuse SQL the approval does not cover"]
  runJob --> execute["EngineSession.execute"]
  execute --> server[("database: read-only session<br/>on read-only connections")]
  perform -.-> log["output channel: decisions with connection,<br/>verbs and tables, never SQL text or values"]
```

Only sqldoro's own statements bypass the guard: catalog queries, `START TRANSACTION`, `COMMIT`,
`ROLLBACK`, the savepoints of an apply and the transaction status probe. What the classifier cannot
see (procedures, triggers, user functions) is what the read-only session is for, and the permissions
of the database user remain the real guarantee.

After each statement sqldoro asks the server whether a transaction is open
(`EngineSession.transactionStatus`), so implicit commits, deadlock rollbacks and aborted
transactions show as they are. The automatic `LIMIT` is a pure rewrite in the core that appends
`LIMIT n + 1` only where that is safe, and falls back to a driver row cap elsewhere.

## Editing rows

```mermaid
sequenceDiagram
  participant W as Webview (grid)
  participant P as ResultsPanel (host)
  participant E as TabEditor (core)
  participant Q as QueryRunner + guard
  participant B as edit-batch
  participant S as EngineSession
  W->>P: edit (checked by the core parser)
  P->>E: act: pending changes (pure reducers)
  W->>P: previewEdits
  P->>E: planEdits: one statement per row,<br/>values bound, key + optimistic check in WHERE
  P-->>W: preview (statements, values, rows each must change)
  W->>P: applyEdits(previewId), once
  P->>Q: perform(RunWork: the plan + the query that reads the rows again)
  Q-->>P: approval (read-only blocked, production confirmed)
  P->>B: apply the plan
  B->>S: START TRANSACTION or SAVEPOINT
  loop each statement
    B->>B: approval.classOf(statement)
    B->>S: execute: exactly one row must change
  end
  B->>S: COMMIT, or ROLLBACK on any failure or conflict
  P-->>W: outcome per row, then the rows read again
```

What can be edited is decided in `src/core/edits/` from what the drivers report (the origin of each
result column, `EngineSession.describeTable`), and fails closed: joins, views, expressions and tables
without a usable key stay read-only, and the grid says why.

## The result view

The extension host runs the statements and keeps their rows (`ResultSet`, in the core). The webview
asks for windows of rows around what is in view (at most 200 at a time, a few thousand cached) and
only shows them; both rows and columns are virtualized, so a million rows or a thousand columns
scroll smoothly. Long values reach the grid cut to 1,000 characters; the detail pane asks for more and
shows up to 200,000. Every message is typed in `src/core/results/protocol.ts` and checked field by
field by the core parsers on the side that receives it. The page has a strict Content Security
Policy: one script with a nonce, styles and images from the extension only, no remote resource; its
icons are inline SVG drawn in the spirit of the codicons, so the page loads no font.

The view only shows what the host decides. Sorting, the filters of the columns and the quick search
are views of the rows the host holds (`ResultSet`): the webview sends the view or the search text, the
host computes the order with pure functions of the core (`applyView`, `searchRows`) and bumps the
view version, and the webview asks for the windows of the new order. The search keeps applying over a
view sorted and filtered on the server, and again once a run brings new rows. The host handles the
messages of the view in `src/extension/results/panel-requests.ts`; the panel itself
(`results-panel.ts`) keeps the tabs of the run and what it posts.

## The explorer and the catalog statistics

The Connections view (`src/extension/tree/`) loads the children of a node when it opens and keeps
them, per connection, until a refresh. `EngineSession.listDatabases` and `listTables` take a
`CatalogDetail`: with `Names` they read the names only (the autocomplete, the pickers, the connection
form); with `Statistics` the same query also reads the size of each database and the estimated rows
and size of each table (`DatabaseStats`, `TableStats` in `src/core/engine/catalog.ts`), one query per
list, never one per object. The values stay exact: the drivers select them as text and the core reads
them as `bigint`; a value the server does not know or the user may not see is `undefined`, never an
error. The explorer asks for the statistics and, if that query fails, lists the names alone and logs
why at debug level, so a missing statistic never breaks a node. The core writes what is shown
(`src/core/engine/catalog-text.ts` and `src/core/text/quantities.ts`: `~27k rows · 32 MB`, sizes
1024-based).

How many tables or views a group holds comes from the list it already loads: the node summarizes its
children while they load, the provider keeps that summary beside the cached children and tells VS Code
to draw the node again. A table or database node knows the node whose list it comes from
(`listedBy`), so refreshing it reads that list again, with its statistics.

## Table data

A table or view opened from the explorer is a source of results like a SQL editor, keyed by a URI of
its own instead of a document URI: `sqldoro-table:` with the connection, the database, the schema
and the table (`src/extension/tables/table-uri.ts`). The same key finds its result panel, its
database session and its transaction, so opening the table again shows the panel it has, and closing
the panel gives the session back; disconnecting or deleting the connection closes it. Its binding
comes from the URI and its transaction mode is always auto-commit. The core builds its statement
(`tableDataQuery`, with the quoting of the dialect), and it runs through `QueryRunner.perform` like
any other run, so the guards, the automatic limit and the editing of rows apply unchanged. The panel
is titled after the connection as it is named now (`src/extension/results/source-title.ts`).

Its **WHERE** is a condition the user writes, like SQL in an editor, and the only text sqldoro puts
into a statement around it: `tableFilterQuery` builds `SELECT * FROM <table> WHERE (<condition>`, a
line break, then `)`, so that a `--` comment at its end cannot hide the parenthesis. It refuses,
before anything runs, a condition whose strings or comments do not end, one that holds only comments,
one whose parentheses close outside it, and anything that makes the statement more than one (read
with the statement splitter of the guards, so a `;` inside a MySQL executable comment counts). The
statement then goes through `QueryRunner.perform` (`src/extension/tables/table-filter.ts`): the
classifier sees the condition with the rest, so a function with effects makes it a write that a
read-only connection refuses. The tab keeps its view (a view on the server wraps the new statement),
gets the automatic limit again, and its Refresh, Load All Rows and server view all read with the
condition; the editability analysis already accepts a `WHERE` after the table, and still fails
closed for anything else. These reads stay out of the query history.

## The connection form

**Add Connection**, **Import Connection from URL** and **Edit Connection** open the connection form,
a second webview with its own bundle and the same page and policy (`src/extension/webview-page.ts`).
Its message protocol is declared in the core (`src/core/connection-form/protocol.ts`) and checked on
both sides. The form keeps its state with pure functions of the core (`src/core/connection-form/`:
the state and its changes, the problems and where they show, the requests to the host, the engine
picker and the import of a connection string, the database listing; the changes of a connection in
`src/core/connection/transitions.ts`) and validates with the same validators as the host, which
checks the connection again before it tests it, saves it or lists its databases. Secrets never
travel to the form: it learns which kinds are held (stored, or from an imported URL), and what the
user types reaches the host only inside a test, a save, a listing of databases or an import. The host
reads a connection string with the same parser as ever (`src/core/connection/url.ts`) and keeps its
password until the connection is saved; a form that reloads forgets it. Listing the databases is one
of sqldoro's own catalog queries (`EngineSession.listDatabases`), in a session opened like a test
(the SSH host key prompt included) and closed again, so it does not go through the statement guard.
The host writes the secrets before the connection itself, so that a keyring that fails leaves
nothing half saved, and a new connection is tested (or its databases listed) with what was typed,
without asking the keyring.

## Packaging and the pipeline

```mermaid
flowchart LR
  pr["pull request / main"] --> lint & quality & integration & architecture & package
  package["package: build, pack and check the .vsix<br/>(artifact sqldoro-vsix)"] --> smoke["smoke: install that .vsix<br/>in a real VS Code"]
  pr --> mutation["mutation (changed core files)"]
  lint & quality & integration & architecture & package & smoke & mutation --> report["quality-report: one PR comment"]
  tag["tag v1.2.3"] --> check["check tag / package.json / CHANGELOG"] --> gates["every gate of ci.yml"] --> draft["draft GitHub release with the .vsix"]
  draft -->|"owner publishes it"| publish["Marketplace and Open VSX<br/>(off: PUBLISH_EXTENSION)"]
```

See [CONTRIBUTING.md](../CONTRIBUTING.md#the-pipeline) for what each gate means and
[RELEASING.md](RELEASING.md) for releases.

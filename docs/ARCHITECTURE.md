# Architecture

sqldoro is a VS Code extension in strict TypeScript, in five layers whose dependencies point inward,
to the core. `make lint-arch` (`.dependency-cruiser.mjs`) fails on an import that breaks them,
`make typecheck` checks the core without Node.js or DOM types, and
`src/extension/safety/guarded-execution.test.ts` fails on any new place that runs SQL.

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

| Layer           | Holds                                                                                                                                                                                | May import                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `src/core`      | Interfaces (`Engine`, `EngineSession`, `TunnelOpener`, `Logger`) and pure functions: classifier, guard policy, automatic `LIMIT`, transactions, edits, result model, message parsers | nothing platform-specific (no `vscode`, Node.js, database, SSH or UI library) |
| `src/drivers`   | One folder per database implementing `Engine`                                                                                                                                        | the core and its own client library                                           |
| `src/tunnel`    | The SSH tunnel implementing the core tunnel interface                                                                                                                                | the core, `ssh2`, Node.js                                                     |
| `src/extension` | The VS Code side; only `factories/` instantiates drivers and the tunnel                                                                                                              | the core, `vscode`, Node.js; drivers only in `factories/`                     |
| `src/webview`   | The result grid and the connection form, each a Vite bundle                                                                                                                          | the core, React, TanStack                                                     |

The host and the webviews never import each other: they share the message protocol of the core and
validate every message they receive. The rows stay in the host; the grid only shows windows of them.
A new engine is a driver registered in `src/extension/factories/engines.ts` (see
[CONTRIBUTING.md](../CONTRIBUTING.md#adding-a-database-engine)).

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

The driver dials the endpoint it is given and never knows about SSH; certificates are checked
against the database host name, also through the tunnel. Errors are redacted of the session's
secrets. Each SQL editor and each table panel has its own session; the explorer and the autocomplete
share one per connection.

## The guard layer

A run declares every statement it may execute in a `RunWork`; `QueryRunner.perform` hands them to
`StatementGuard`, which decides before anything runs, and `QueryRunner.runJob` refuses SQL the guard
did not approve.

```mermaid
flowchart TB
  sources["Run Query · Run Script · history · saved query in an editor ·<br/>EXPLAIN / EXPLAIN ANALYZE · sort on the server · Load All Rows ·<br/>a table panel, its WHERE and query box · apply the edits of the grid"]
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
`ROLLBACK`, the savepoints of an apply, the transaction status probe, and the `sql_mode` an apply
turns strict on MySQL and puts back after it (`EngineSession.startStrictWrites`). After each
statement sqldoro asks the server whether a transaction is open (`EngineSession.transactionStatus`).
The automatic `LIMIT` is a pure rewrite in the core (`LIMIT n + 1` where safe, a driver row cap
elsewhere).

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
  B->>S: startStrictWrites (MySQL: strict sql_mode in this session only)
  B->>S: START TRANSACTION or SAVEPOINT
  loop each statement
    B->>B: approval.classOf(statement)
    B->>S: execute: exactly one row must change
  end
  B->>S: COMMIT, or ROLLBACK on any failure or conflict
  B->>S: put the session's own sql_mode back, whatever happened
  P-->>W: outcome per row, then the rows read again
```

MySQL outside strict mode stores a value a column cannot hold as the nearest one it can (cut,
rounded) with only a warning. An apply turns strict mode on in the editor's own session for its
statements only, then puts the session's `sql_mode` back, even when the apply fails or is
cancelled: the server, other sessions and the user's own queries keep theirs. If it cannot put it
back, the apply's message and the log say so.

`src/core/edits/` decides what can be edited from what the drivers report (the origin of each result
column, `EngineSession.describeTable`) and fails closed: joins, views, expressions and tables without
a usable key stay read-only, and the grid says why.

## The result view

- **Rows stay in the host** (`ResultSet`). The webview asks for windows around what is in view (at
  most 200 rows at a time, a few thousand cached); rows and columns are virtualized. Values reach the
  grid cut to 1,000 characters; the detail pane asks for up to 200,000.
- **Protocol**: every message is typed in `src/core/results/protocol.ts` (`tab-editing.ts`,
  `tab-meta.ts`) and checked by the core parsers on the receiving side. The page has a strict CSP:
  one script with a nonce, no remote resource, inline SVG icons.
- **Sort, filters, quick search** are views the host computes with pure core functions
  (`applyView`, `searchRows`); the webview then asks for windows of the new order. Column filters
  (`src/core/results/conditions.ts`) compare exactly in the host (`filter-match.ts`) and become bound,
  cast conditions on the server (`filter-sql.ts`, `binders.ts`).
- **Columns**: the layout (`src/core/grid/column-layout.ts`) orders and hides columns by key; the
  webview works on the projected columns (`column-projection.ts`, `src/webview/projection.ts`) and
  translates every message back. Table panels keep their layout per table in the workspace state.
- **Loading** never blanks the view: `tabToShow` (`src/core/grid/shown-tab.ts`) keeps the last ready
  tab until the next one `isViewReady`, and `stepIndicator` (`loading-indicator.ts`, a pure state
  machine) shows a card only after 300 ms, for at least 400 ms. `prefers-reduced-motion` turns off the
  animations.
- **Host side**: `src/extension/results/results-panel.ts` keeps the tabs and posts them;
  `panel-requests.ts` and `panel-navigation-requests.ts` handle the messages.

## The explorer and finding tables

- **Loading**: the Connections view (`src/extension/tree/`) loads children when a node opens and
  caches them per connection until a refresh (`ExplorerProvider.onDidRefresh`).
- **Statistics**: with `CatalogDetail.Statistics`, `listDatabases` and `listTables` read sizes and
  estimated rows in the query that lists the objects, as text read to `bigint`; unknown is
  `undefined`, and a failing statistics query falls back to the names (logged at debug level).
- **Looks**: `NodeIcon` (`node-icons.ts`) gives each kind a codicon and a theme color; connections
  show their engine glyph, and their color reaches the label through file decorations
  (`node-uris.ts`, `ExplorerDecorations`). Databases and schemas paint their icon in that color
  (`NodeContext.tint`, resolved by `connectionTint` when the node is drawn), the database in front
  keeping its green. Folders come from `src/core/connection/folders.ts`.
- **The database in front**: `selectedScopes` and `changedScopes` (`src/core/editor/selection.ts`)
  decide which database and schema stand out; only the nodes whose mark changed are redrawn, without
  reading the catalog.
- **Find Table in Explorer** (`TableFinder`, `src/extension/commands/table-finder.ts`) filters on
  every keystroke without touching the server: `TableIndex` loads the names once through the schema
  cache, `findTables` (`src/core/table-search/found.ts`) and `matchName` (`src/core/text/fuzzy.ts`)
  match like VS Code, and `FindTree` updates only the branches `foundChanges` reports, at most once
  every 220 ms. **Go to Table…** uses the same matcher.

## Table panels

- **Source**: a table opened from the explorer is keyed by a `sqldoro-table:` URI
  (`src/extension/tables/table-uri.ts`) that finds its panel, session and transaction (always
  auto-commit). The core writes its statements (`src/core/results/table-data.ts`, and
  `table-query.ts` for a step of the trail with its key, filters and WHERE), which run through
  `QueryRunner.perform` (`table-read.ts`) like any run; these reads stay out of the history.
- **WHERE**: `tableFilterQuery` wraps the user's condition as `WHERE (<condition>` + line break +
  `)`, and refuses before running anything a condition with open strings, comments or parentheses,
  only comments, or more than one statement. The classifier sees it with the rest of the statement.
- **Query box**: shows the panel's statement (`src/core/results/query-box.ts`); its state is pure
  (`src/core/grid/query-mode.ts`). Running it checks for one statement (`boxQuery`) and goes through
  `QueryRunner.perform` like an editor (`src/extension/tables/query-box.ts`), recorded in the
  history; only then does the trail get a step. Going back and forth re-runs a step only when it
  reads (`isReadOnlyQuery`).
- **Navigation**: links come from the catalog, never the query text (`TableMetadata`,
  `src/core/navigation/links.ts`, `keys.ts`). Table panels keep a trail of steps
  (`src/core/navigation/history.ts`, `TableNavigations`). Peeks and reference counts go through
  `readThroughGuards` / `runApprovedRead`, which refuse anything that is not a read.

## The connection form

A second webview (same page and policy, `src/extension/webview-page.ts`) with its protocol in
`src/core/connection-form/protocol.ts`. Its state, problems and requests are pure core functions,
validated with the same validators the host runs again before testing, saving or listing databases.
Secrets never travel to the form: it only learns which kinds are held. Listing databases opens a
test-like session and runs a catalog query. The host writes the secrets before the connection, so a
failing keyring leaves nothing half saved.

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

See [CONTRIBUTING.md](../CONTRIBUTING.md#the-pipeline) for each gate and
[RELEASING.md](RELEASING.md) for releases.

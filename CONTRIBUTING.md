# Contributing to sqldoro

Thanks for helping! Every change comes with tests, and the checks are never loosened to let code
through. [`CLAUDE.md`](CLAUDE.md) holds the full rules (architecture, conventions, style) that people
and AI agents follow alike; [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how the pieces
fit. By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md); report security problems
privately, as [`SECURITY.md`](SECURITY.md) explains.

## Running it locally

You need Node.js 24 (npm refuses other versions, see `devEngines`), npm, VS Code, and Docker with
Compose for the integration tests.

```sh
make setup        # locked dependencies (npm ci) and the git hooks
make quality      # every static check and the unit tests: what the pre-commit hook runs
```

Press **F5** in VS Code ("Run Extension") to open an Extension Development Host with sqldoro.
`make integration` leaves its servers running, so you can connect to them (throwaway credentials):

| Server     | Image                       | Address           | User / password        | Database  |
| ---------- | --------------------------- | ----------------- | ---------------------- | --------- |
| MySQL      | `mysql:8.4.11`              | `127.0.0.1:33306` | `sqldoro / sqldoro-it` | `sqldoro` |
| PostgreSQL | `postgres:18.6-alpine`      | `127.0.0.1:35432` | `sqldoro / sqldoro-it` | `sqldoro` |
| OpenSSH    | `testcontainers/sshd:1.3.0` | `127.0.0.1:32222` | `root / sqldoro-it`    |           |

Through the SSH server the databases are `mysql:3306` and `postgres:5432`. Override an address with
`SQLDORO_IT_<MYSQL|POSTGRES|SSH>_HOST` and `_PORT`. On Linux without a keyring, start the
Extension Development Host with `--password-store=basic`. `make smoke` needs a display (or
`xvfb-run`).

### Make targets

| Command                 | Description                                                                |
| ----------------------- | -------------------------------------------------------------------------- |
| `make setup`            | Install the locked dependencies and the git hooks.                         |
| `make build`            | Bundle the extension (esbuild) and the webviews (Vite) into `dist/`.       |
| `make package`          | Build, then pack and check `sqldoro-<version>.vsix`.                       |
| `make format`           | Format (Prettier) and apply the fixes ESLint can make.                     |
| `make lint`             | ESLint and the Prettier check.                                             |
| `make typecheck`        | tsc 7 strict: the whole project, then the core alone.                      |
| `make test`             | Unit tests with coverage (100%, a ratchet).                                |
| `make lint-arch`        | Architecture contracts (dependency-cruiser).                               |
| `make dead-code`        | Unused files, exports and dependencies (knip).                             |
| `make audit`            | Known vulnerabilities in the dependencies.                                 |
| `make quality`          | All of the above but the build: what the pre-commit hook runs.             |
| `make integration`      | Start the test servers (Docker Compose) and run the integration tests.     |
| `make integration-down` | Stop and remove the integration test servers.                              |
| `make smoke`            | Pack the extension and run it in a real VS Code.                           |
| `make mutation`         | Mutation testing of the whole core (slow; weekly in CI).                   |
| `make mutation-changed` | Mutation testing of the core files changed against `BASE` (`origin/main`). |
| `make all`              | Everything CI runs on a pull request.                                      |

## Making a change

1. Branch from `main`; one pull request, one subject.
2. Write the tests next to the code (`greeting.test.ts` beside `greeting.ts`). Mock only the external
   boundary: the VS Code API (`test/vscode.ts`), database servers (the client fakes in `test/fakes/`),
   the network, the clock.
3. Run `make quality`, plus `make smoke` for the extension host, manifest or build,
   `make mutation-changed` for `src/core`, and `make integration` for a driver, the tunnel or how
   sessions open.
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/) (`feat`, `fix`,
   `refactor`, `chore`, `test`, `docs`, `ci`, `build`); the commit-msg hook checks it.
5. Open the pull request with the template. CI posts one **Quality Report** comment; a failing check
   means it is not ready.

Contributed commands, settings and views are the public contract: do not remove or rename one unless
that is the point of the change. Every statement a user or the grid runs goes through the safety
guards ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-guard-layer));
`src/extension/safety/guarded-execution.test.ts` fails on any new place that runs SQL.

## The pipeline

Strict from day one, with no baseline (a TypeScript port of
[py-awesome-template](https://github.com/mathmed/py-awesome-template)'s). Code is refactored to meet
the gates; relaxing a threshold, rule or contract needs the owner's explicit approval.

| Gate               | Tool                                                           | Guarantees                                                                                        | Runs in                      |
| ------------------ | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------- |
| Lint and format    | ESLint (typescript-eslint strict, SonarJS, security), Prettier | Every rule an error, `--max-warnings 0`; a disable needs a reason.                                | pre-commit, `lint`           |
| Complexity         | ESLint                                                         | Complexity 5, nesting 2, 30 lines per function, 3 parameters, 300 lines per file; never disabled. | pre-commit, `lint`           |
| Types              | tsc 7 strict, plus the extra flags of `tsconfig.json`          | No `any`; the core type-checks without Node.js or DOM types.                                      | pre-commit, `quality`        |
| Security           | eslint-plugin-security, no-unsanitized, `npm audit`            | No shell, `eval` or unsanitized HTML; no known vulnerable dependency.                             | pre-commit, `lint`/`quality` |
| Dead code          | knip                                                           | No unused file, export or dependency, no stale configuration.                                     | pre-commit, `quality`        |
| Tests and coverage | Vitest (Node.js; jsdom and Testing Library for the webview)    | 100% statements, branches, functions and lines, as a ratchet.                                     | pre-commit, `quality`        |
| Integration        | Vitest against MySQL 8.4, PostgreSQL 18 and OpenSSH            | Drivers, tunnel and extension host behave on real servers.                                        | `integration`                |
| Architecture       | dependency-cruiser                                             | The layer contracts of `.dependency-cruiser.mjs`.                                                 | pre-commit, `architecture`   |
| Build and package  | esbuild, Vite, vsce, `scripts/package/`                        | The `.vsix` holds exactly what it should, with shippable licenses, under its budget.              | `package`                    |
| Smoke              | `@vscode/test-electron` (xvfb in CI)                           | The packaged `.vsix` installs, activates, registers every command and view, loads its webviews.   | `smoke`                      |
| Mutation testing   | Stryker on `src/core`                                          | The score stays above `MUTATION_MIN_SCORE` (95).                                                  | `mutation` workflow          |
| Report             | `scripts/quality-report.ts`                                    | One Quality Report comment per pull request.                                                      | `quality-report`             |

Git hooks run through [lefthook](https://lefthook.dev/): pre-commit formats the staged files and runs
`make quality`'s checks (the tests without the `GIT_*` variables git exports to hooks; tests that
need a repository create one with `test/support/git.ts`); commit-msg enforces Conventional Commits.
Dependabot proposes grouped weekly updates after a cooldown (major 15 days, minor 10, patch 5).

### Integration, packaging, smoke and mutation

- **Integration**: `*.integration.test.ts` (run by `vitest.integration.config.ts`) against
  `test/integration/compose.yaml` locally and the same images as service containers of the
  `integration` job (keep both in sync). Tests create their own tables and SSH keys; no private key
  is stored.
- **Packaging**: `scripts/package.ts` packs `dist/` reproducibly (files sorted and dated at the last
  commit) and checks the `.vsix` against `scripts/package/vsix-rules.ts`: the allow list of
  `.vscodeignore`, the files the manifest names, a size budget. The build writes
  `dist/ThirdPartyNotices.txt` and fails on a license sqldoro cannot ship. CI uploads the
  `sqldoro-vsix` artifact; releases are in [`docs/RELEASING.md`](docs/RELEASING.md).
- **Icon**: `media/icon.png` is `media/icon.svg` rendered at 256×256 (on macOS:
  `sips -s format png media/icon.svg --out media/icon.png`); keep both in sync.
- **Engine glyphs** (`media/explorer/<engine>-<connected|disconnected>-<light|dark>.svg`): a new
  engine needs its four files, their names in `scripts/package/vsix-rules.ts` and an entry in
  `ENGINES_WITH_GLYPHS` (`src/extension/tree/node-icons.ts`), or it shows a codicon.
- **Smoke**: `scripts/smoke.ts` installs the packaged `.vsix` (or `SMOKE_VSIX`) in VS Code (latest
  stable, or `SMOKE_VSCODE_VERSION`) with a fresh profile in the system temporary folder (macOS caps
  socket paths at 103 characters) and runs `test/smoke/suite.ts`.
- **Mutation testing**: [Stryker](https://stryker-mutator.io/) mutates `src/core` and runs the unit
  tests against each mutant. For each **survivor**, add the missing assertion; `MUTATION_MIN_SCORE`
  only goes up. Mutants run through the command runner, one Vitest process each, until Stryker's
  Vitest runner supports Vitest 5
  ([stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210)).

### Quality Report

Each pull request gets **one** comment (marker `<!-- quality-report -->`, updated on every push) with
the verdict and a section per analysis (✅ ok, ⚠️ warning, ❌ failed, ⏭️ not run). Each CI job runs
its tool through `node scripts/quality-report.ts run <analysis> -- <command>`, which keeps the tool's
exit code and saves a fragment uploaded as `quality-fragment-<job>`; the `quality-report` job renders
them (also to the job summary, the fallback for forks). Render locally with
`node scripts/quality-report.ts render --dir quality-fragments`.

To add an analysis:

1. Add a value to `Analysis` (`scripts/quality-report/analysis.ts`).
2. Write its analyzer in `scripts/quality-report/analyzers/`, tested against real output of the tool.
3. Add a `Check` to `SECTIONS` (`scripts/quality-report/sections.ts`).
4. Run the tool through the wrapper in its job, and upload `quality-fragments/` as
   `quality-fragment-<job>` with `if: ${{ !cancelled() }}`.
5. Add the job to the `needs` of `quality-report`.

## Adding a database engine

The core knows engines only through `Engine` (`src/core/engine/engine.ts`) and the `EngineRegistry`.
For a hypothetical engine **Acme** (client library `acme-client`):

1. **Dialect** (`src/drivers/acme/acme-dialect.ts`): quoting, schemas, parameter style, literals;
   `lexical` rules (escapes, dollar quoting, comments), which the splitter, the classifier and the
   history's password masking rely on, so test them hard; `keywords`, the `EXPLAIN` prefixes,
   `hasTransactionalDdl`, and `sideEffectFunctions` (calls the classifier treats as writes).
2. **Engine** (`src/drivers/acme/acme-engine.ts`): `id`, `displayName`, `defaultPort`, `urlSchemes`,
   the dialect, and `connect`, which returns an `EngineSession`:
   - dial the `endpoint` it is given (maybe a tunnel; drivers never know about SSH), verify
     certificates against `tls.serverName`, and open the session read-only on the server when
     `isReadOnly` is set;
   - add an `error` listener to every event emitter at once, and call `onUnexpectedClose` once when
     the session ends unexpectedly;
   - the catalog (`listDatabases`, `listSchemas`, `listTables`, `listViews`, `listColumns`,
     `listIndexes`, `listForeignKeys`, `objectDdl`, `useScope`) with bound values; with
     `CatalogDetail.Statistics`, sizes and estimated rows in the same query, as text, `NULL` when
     unknown or not visible (never an error);
   - `execute`: stream rows through `onRows`, stop at `maxRows`, report each column's `origin`, keep
     `DECIMAL`, `BIGINT` and dates as text, `cancel` from a second connection;
   - `transactionStatus` (ask the server), `describeTable` (what editing needs) and
     `startStrictWrites` (make the session refuse what a column cannot hold for an apply, and
     return what puts it back as it was).
3. **Register it** in `src/extension/factories/engines.ts`:
   `new EngineRegistry([mysqlEngine, postgresEngine, acmeEngine])`.
4. **Keep the contracts**: the driver imports only the core and `acme-client`; add `acme-client` to
   `DATABASE_CLIENTS` in `.dependency-cruiser.mjs`.
5. **Test it**: unit tests against a fake of `acme-client` in `test/fakes/`, a dialect corpus for the
   classifier and splitter, and integration tests against a real server (add it to
   `test/integration/compose.yaml` and the `integration` job; follow
   `src/drivers/*/*.integration.test.ts`).
6. **Document it** in the README and the changelog.

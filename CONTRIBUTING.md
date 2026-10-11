# Contributing to sqldoro

Thanks for helping! sqldoro is a small project with a strict pipeline: every change comes with tests,
and the checks are never loosened to let code through. This guide covers running the project, what
each check means, and how to add a database engine. [`CLAUDE.md`](CLAUDE.md) holds the full rules
(architecture, conventions, style) that people and AI agents follow alike, and
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) explains how the pieces fit.

By taking part you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report security problems
privately, as [`SECURITY.md`](SECURITY.md) explains, never in a public issue.

## Running it locally

You need Node.js 24 (the runtime of the VS Code extension host: `package.json` declares it in
`devEngines`, and npm refuses other versions), npm, VS Code, and Docker with Compose for the
integration tests.

```sh
make setup        # npm ci (locked dependencies, no install scripts) and the git hooks
make quality      # every static check and the unit tests: what the pre-commit hook runs
make integration  # the drivers, the SSH tunnel and the extension host against real servers (Docker)
make smoke        # build, pack the .vsix and install it in a real VS Code
```

Press **F5** in VS Code ("Run Extension") to build the extension and open it in an Extension
Development Host, then open the **sqldoro** view in the activity bar. `make integration` leaves its
servers running, so you can connect the Extension Development Host to them:

| Server     | Image                       | Address           | User / password        | Database  |
| ---------- | --------------------------- | ----------------- | ---------------------- | --------- |
| MySQL      | `mysql:8.4.11`              | `127.0.0.1:33306` | `sqldoro / sqldoro-it` | `sqldoro` |
| PostgreSQL | `postgres:18.6-alpine`      | `127.0.0.1:35432` | `sqldoro / sqldoro-it` | `sqldoro` |
| OpenSSH    | `testcontainers/sshd:1.3.0` | `127.0.0.1:32222` | `root / sqldoro-it`    |           |

These are throwaway credentials of local test containers. The SSH server reaches the databases as
`mysql:3306` and `postgres:5432`. Each address can be overridden with `SQLDORO_IT_<SERVER>_HOST` and
`SQLDORO_IT_<SERVER>_PORT` (`MYSQL`, `POSTGRES`, `SSH`). `make integration-down` stops them.

On Linux without a keyring VS Code's secret storage can hang: start the Extension Development Host
with `--password-store=basic`. `make smoke` needs a display, or `xvfb-run` on a headless machine.

### Make targets

| Command                 | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `make setup`            | Install the locked dependencies and the git hooks.                                  |
| `make build`            | Bundle the extension (esbuild) and the webviews (Vite) into `dist/`.                |
| `make package`          | Build, then pack and check `sqldoro-<version>.vsix` (vsce).                         |
| `make format`           | Format every file (Prettier) and apply the fixes ESLint can make.                   |
| `make lint`             | ESLint (strict type-checked, complexity and security rules) and the Prettier check. |
| `make typecheck`        | tsc 7 strict on the whole project, the platform-agnostic core alone, the webview.   |
| `make test`             | Unit tests with coverage (Vitest); thresholds at 100% that only go up.              |
| `make lint-arch`        | Architecture contracts (dependency-cruiser).                                        |
| `make dead-code`        | Unused files, exports, dependencies and stale configuration (knip).                 |
| `make audit`            | Known vulnerabilities in the dependencies (`npm audit`).                            |
| `make quality`          | All of the above but the build: what the pre-commit hook runs.                      |
| `make integration`      | Start the test servers (Docker Compose) and run the integration tests.              |
| `make integration-down` | Stop and remove the integration test servers.                                       |
| `make smoke`            | Pack the extension and run it in a real VS Code.                                    |
| `make mutation`         | Mutation testing of the whole core (Stryker; slow, weekly in CI).                   |
| `make mutation-changed` | Mutation testing of the core files changed against `BASE` (default `origin/main`).  |
| `make all`              | Everything CI runs on a pull request.                                               |

## Making a change

1. Branch from `main`, and keep each pull request about one thing.
2. Write the test with the code, next to it (`greeting.test.ts` beside `greeting.ts`). Mock only the
   external boundary: the VS Code API through `test/vscode.ts`, database servers through the fakes of
   their client libraries in `test/fakes/`, the network, the clock.
3. Run `make quality` (the pre-commit hook does), plus `make smoke` when you change the extension
   host, the manifest or the build, `make mutation-changed` when you change `src/core`, and
   `make integration` when you change a driver, the tunnel or how sessions open.
4. Commit with [Conventional Commits](https://www.conventionalcommits.org/): `feat`, `fix`,
   `refactor`, `chore`, `test`, `docs`, `ci` or `build` (the commit-msg hook checks it).
5. Open the pull request with the template. CI runs every check and posts one **Quality Report**
   comment; a pull request with a failing check is not ready.

Contributed commands, settings and views are the public contract of the extension: do not remove or
rename one unless that is the point of the change. Every statement a user or the grid runs goes
through the safety guards (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-guard-layer)):
`src/extension/safety/guarded-execution.test.ts` fails on any new place that runs SQL.

## The pipeline

The pipeline is a TypeScript port of
[py-awesome-template](https://github.com/mathmed/py-awesome-template)'s: the same layers, strict
from day one, with no baseline. Code is refactored to meet the gates; the gates are never loosened to
meet the code. Relaxing a threshold, a rule or a contract needs the owner's explicit approval.

| Gate               | Tool                                                                                                               | What it guarantees                                                                                                       | Runs in                        |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Lint               | ESLint 10, typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, SonarJS, perfectionist, eslint-comments | Every rule an error, `--max-warnings 0`; a disable needs a reason.                                                       | pre-commit, `lint` job         |
| Format             | Prettier                                                                                                           | One formatting, checked.                                                                                                 | pre-commit, `lint` job         |
| Types              | tsc 7 strict, plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess` and the rest of `tsconfig.json`        | No `any`; the core type-checks without Node.js or DOM types, so it stays platform-agnostic.                              | pre-commit, `quality` job      |
| Complexity         | ESLint: cyclomatic and cognitive complexity 5, nesting 2, 30 lines per function, 3 parameters, 300 lines per file  | Small functions; these limits cannot be disabled inline.                                                                 | pre-commit, `lint` job         |
| Security           | eslint-plugin-security, eslint-plugin-no-unsanitized, SonarJS hotspots, no shell or `eval`; `npm audit`            | No known vulnerable dependency; no shell, `eval` or unsanitized HTML.                                                    | pre-commit, `lint`/`quality`   |
| Dead code          | knip                                                                                                               | No unused file, export or dependency, no stale configuration.                                                            | pre-commit, `quality` job      |
| Tests and coverage | Vitest with V8 coverage (Node.js, and jsdom with Testing Library for the webview)                                  | 100% of statements, branches, functions and lines, as a ratchet that only goes up.                                       | pre-commit, `quality` job      |
| Integration        | Vitest against real MySQL 8.4, PostgreSQL 18 and OpenSSH (service containers in CI, Docker Compose locally)        | The drivers, the tunnel and the extension host behave on real servers: types, cancels, edits, read-only sessions, loss.  | `integration` job              |
| Architecture       | dependency-cruiser                                                                                                 | The layer contracts of `.dependency-cruiser.mjs`.                                                                        | pre-commit, `architecture` job |
| Build and package  | esbuild, Vite, vsce, `scripts/package/`                                                                            | The `.vsix` holds exactly what it should, every bundled license allows shipping it, and it stays under its budget.       | `package` job                  |
| Smoke              | `@vscode/test-electron`, xvfb in CI                                                                                | The packaged `.vsix` installs in a real VS Code, activates, registers every command and view, and loads the result view. | `smoke` job                    |
| Mutation testing   | Stryker on `src/core`: the changed files on pull requests, the whole core weekly                                   | The tests notice when the core is wrong, not only when it runs: the score stays above `MUTATION_MIN_SCORE` (95).         | `mutation` workflow            |
| Report             | `scripts/quality-report.ts`                                                                                        | One Quality Report comment per pull request, built from every job.                                                       | `quality-report` job           |

Git hooks run through [lefthook](https://lefthook.dev/): pre-commit formats the staged files and runs
`make quality`'s checks in parallel (the tests without the `GIT_DIR`, `GIT_INDEX_FILE`... git exports
to hooks, so that no test reaches the repository being committed); commit-msg enforces Conventional
Commits. Tests that need a git repository create a throwaway one with `test/support/git.ts`, which
also clears the inherited `GIT_*` variables and the user's git configuration for the test. Dependabot proposes
grouped weekly updates after a cooldown (major 15 days, minor 10, patch 5).

### Integration tests (`make integration`)

Unit tests stand in for the database servers with fakes of the client libraries (`test/fakes/`); the
integration tests run against real servers instead: `src/**/*.integration.test.ts` and
`test/integration/*.integration.test.ts`, run by `vitest.integration.config.ts`. CI starts the same
images as service containers of the `integration` job (keep `test/integration/compose.yaml` and
`.github/workflows/ci.yml` in sync). The tests create their own tables and schemas, wait for the
servers, and generate their SSH keys on the fly: no private key is stored in the repository. The
extension host runs there too, wired as in VS Code with the fake of the `vscode` module: editing
rows, read-only sessions, a session the server ends mid-query, huge values and wide results.

### Packaging (`make package`)

`scripts/package.ts` packs `dist/` with `@vscode/vsce` into `sqldoro-<version>.vsix`, reproducibly
(files sorted and dated at the last commit), then reads the archive back and checks it against
`scripts/package/vsix-rules.ts`: the files of `.vscodeignore` (an allow list), the files the manifest
names (entry point, icons, walkthrough pages), and a size budget. The build writes
`dist/ThirdPartyNotices.txt` with the license of every library the bundles hold, and fails on a
license sqldoro cannot ship. The CI uploads the package as the `sqldoro-vsix` artifact on every pull
request and on `main`. Releases are described in [`docs/RELEASING.md`](docs/RELEASING.md).

The icon, `media/icon.png`, is rendered from `media/icon.svg` at 256×256 pixels with any SVG renderer
(for example a headless Chromium): keep both in sync.

### Extension smoke test (`make smoke`)

`scripts/smoke.ts` downloads VS Code (latest stable, or `SMOKE_VSCODE_VERSION`) with
[`@vscode/test-electron`](https://github.com/microsoft/vscode-test), installs the packaged `.vsix` (or
`SMOKE_VSIX`) in a fresh profile without telemetry, and runs `test/smoke/suite.ts` inside it: the
extension must come from the package, activate, register every command and view of `package.json`
(each view opens and refreshes), answer `sqldoro.hello`, load the result view of a SQL editor (the
React bundle runs under its Content Security Policy and tells the extension it is ready), then close
and load it again, and load the connection form of **Add Connection** and of **Import Connection
from URL** the same way. The profile lives in the temporary folder of the system: VS Code opens a
socket in it, and macOS refuses socket paths over 103 characters, which a deep checkout would exceed. Each step prints a `>> ` line that the Quality Report summarises.

### Mutation testing (`make mutation`)

[Stryker](https://stryker-mutator.io/) changes the core (flips a condition, empties a string, removes
a block) and runs the unit tests against each change. A mutant no test notices is a **survivor**: that
code runs, but its behaviour is not asserted. The scope is `src/core`; on pull requests only the core
files changed in the diff are mutated, and the whole core weekly. The job fails below
`MUTATION_MIN_SCORE`, a repository variable that works as a ratchet: raise it as the score allows,
never lower it. For each survivor, add the missing assertion. Stryker's Vitest runner cannot select
tests on Vitest 5 yet ([stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210)),
so mutants run through its command runner, one fresh Vitest process each.

### Quality Report

Every pull request gets **one** comment (marker `<!-- quality-report -->`, updated in place on every
push) with the verdict, a status table and a section per analysis: ✅ ok, ⚠️ warning, ❌ failed, ⏭️ not
run. Each analysis runs in its CI job through `node scripts/quality-report.ts run <analysis> --
<command>`, which keeps the tool's exit code (the job stays the gate) and saves a fragment that the
job uploads as `quality-fragment-<job>`. The `quality-report` job renders them; the report is also
written to the job summary, the fallback for pull requests from forks.

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
| Build and package  | esbuild + Vite + vsce    | `package`        | bundle sizes; the `.vsix`, its size, files and sha256, or its problems    |
| Extension smoke    | VS Code                  | `smoke`          | VS Code version, activation time, commands, views, result view            |
| Mutation testing   | Stryker (`mutation.yml`) | `mutation`       | score vs. ratchet, killed and surviving mutants by file, line and mutator |

To add an analysis: add a value to `Analysis` (`scripts/quality-report/analysis.ts`), write an
analyzer in `scripts/quality-report/analyzers/` tested against real output of its tool, add a `Check`
to `SECTIONS` (`scripts/quality-report/sections.ts`), run the tool through the wrapper in its job and
upload `quality-fragments/` as `quality-fragment-<job>` with `if: ${{ !cancelled() }}`, and add the
job to the `needs` of `quality-report`. Render locally with
`node scripts/quality-report.ts render --dir quality-fragments`.

## Adding a database engine

The core knows engines only through the `Engine` interface (`src/core/engine/engine.ts`) and the
`EngineRegistry`: nothing in the core, the extension host or the webview names MySQL or PostgreSQL.
Supporting another database means writing its driver and registering it. As a worked outline, here is
what adding a hypothetical engine **Acme** (client library `acme-client`) takes:

1. **The dialect** (`src/drivers/acme/acme-dialect.ts`): a `Dialect` object, which is what the core
   needs to know about the language:
   - `identifierQuote` (`"` or `` ` ``), `hasSchemas` and `defaultSchema`, `parameterStyle` (`?` or
     `$1`), `binaryLiteral`, `textType`;
   - `lexical`: the `LexicalRules` of its SQL (backslash escapes, dollar quoting, nested comments,
     `#` comments...). The statement splitter, the classifier of the safety guards and the history's
     password masking read SQL through these rules, so get them right first and test them hard;
   - `keywords` for the autocomplete, and `explainPrefix` / `explainAnalyzePrefix`;
   - `hasTransactionalDdl`, and `sideEffectFunctions`: the functions that change something when a
     query calls them (sequences, locks, other sessions, files). The classifier treats a query that
     calls one as a write, so read-only connections refuse it.
2. **The engine** (`src/drivers/acme/acme-engine.ts`): an `Engine` with its `id` (`'acme'`),
   `displayName`, `defaultPort`, `urlSchemes` (for **Import from URL**), the dialect, and `connect`,
   which returns an `EngineSession`:
   - connect to the `endpoint` it is given (the database, or the local end of an SSH tunnel the core
     opened: drivers never know about SSH), verify certificates against `tls.serverName`, and open the
     session **read-only on the server** when `isReadOnly` is set (that is the second layer of the
     guards);
   - attach an `error` listener to every event emitter of the client library as soon as it exists,
     and call `onUnexpectedClose` once when the server or the network ends the session;
   - the catalog (`listDatabases`, `listSchemas`, `listTables`, `listViews`, `listColumns`,
     `listIndexes`, `listForeignKeys`, `objectDdl`, `useScope`), with values bound as parameters.
     Asked for `CatalogDetail.Statistics`, `listDatabases` and `listTables` read the size of each
     database and the estimated rows and size of each table in the same query that lists them, as
     text read with `readDatabaseStats` / `readTableStats` (exact), and `NULL` where the server does
     not know or the user may not see: a missing privilege is never an error;
   - `execute`: stream rows in batches through `onRows`, stop at `maxRows` and flag truncation,
     report each column's `origin` (table and column) when the server says it, keep `DECIMAL`,
     `BIGINT` and dates as the server's text, and `cancel` from a second connection;
   - `transactionStatus` (ask the server, do not guess), `describeTable` (what editing needs: kind,
     columns, how each takes and compares values, keys) and `writeProblem` (anything that would make
     the server change a value instead of refusing it).
3. **Register it** in `src/extension/factories/engines.ts`:
   `new EngineRegistry([mysqlEngine, postgresEngine, acmeEngine])`. The connection form, the
   explorer, the editors, the guards and the grid pick it up from there.
4. **Keep the contracts**: the driver imports only the core and `acme-client` (never another driver,
   the tunnel, `vscode`, the extension host or the webview). Add `acme-client` to `DATABASE_CLIENTS`
   in `.dependency-cruiser.mjs`, so that the core and the webview can never import it.
5. **Test it**: unit tests against a fake of `acme-client` in `test/fakes/` (the external boundary),
   a dialect corpus for the classifier and the splitter, and integration tests against a real server:
   add it to `test/integration/compose.yaml` and to the service containers of the `integration` job,
   and follow `src/drivers/*/*.integration.test.ts` (types written and read back exactly, cancel,
   streaming, read-only sessions refusing every write of the corpus with the classifier bypassed,
   edits and their conflicts).
6. **Document it** in the README (features, limits) and the changelog.

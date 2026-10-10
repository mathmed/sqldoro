# sqldoro

[![CI](https://github.com/mathmed/sqldoro/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/mathmed/sqldoro/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-%5E1.140-007ACC?logo=visualstudiocode)](https://code.visualstudio.com/)
[![No telemetry](https://img.shields.io/badge/telemetry-none-brightgreen.svg)](#privacy)

A fast, safe MySQL and PostgreSQL client that lives inside VS Code. Open source (MIT), no telemetry,
built to make the dangerous queries hard and the everyday ones quick.

> [!NOTE]
> Early development. Phase 1, the foundation, is in: saved MySQL and PostgreSQL connections with SSL
> and SSH tunnels, secrets in VS Code's secret storage, and a schema explorer. The SQL editor, the
> result grid and the safety guards come next, each one judged by the same strict pipeline.

## What works today

- **Connections view** in the activity bar: add, edit, duplicate, delete, test, connect and
  disconnect connections. Each connection shows its status (disconnected, connecting, connected,
  failed) and its environment: tagged connections show a badge such as `PROD`, and the icon takes the
  environment's color (production in red).
- **Connection form**: a quick pick where each field shows its value and its problems; select a field
  to change it, then **Save** or **Test Connection**. Fields: name, engine, host, port, user, password,
  database, SSL (mode, CA certificate, client certificate and key, whether unauthorized certificates
  are rejected), SSH tunnel, environment tag (none, local, dev, staging, prod) and the read-only flag.
  New connections are **read-only** and untagged until you decide otherwise; the read-only flag and
  the environment tag are saved now and enforced by the safety guards of a later phase.
- **Import from URL**: `mysql://`, `postgres://` and `postgresql://` URLs, with percent-encoded user,
  password and database, IPv6 hosts in brackets and the SSL parameters of both dialects (`sslmode` or
  `ssl-mode`, `sslrootcert`/`ssl-ca`, `sslcert`/`ssl-cert`, `sslkey`/`ssl-key`, `ssl=true`). The
  form opens with what the URL holds for you to review; unknown parameters are reported, and `prefer`
  is turned into `require` rather than silently falling back to plain text.
- **SSL modes**: `disable`; `require` (encrypted, and the certificate must verify unless you accept
  unauthorized certificates); `verify-ca` (trusted certificate, any host name); `verify-full`
  (trusted certificate naming the host). Certificates are checked against the database host name even
  through an SSH tunnel.
- **SSH tunnels** with a password (also answering keyboard-interactive prompts) or a private key and
  its passphrase. The tunnel listens on `127.0.0.1` only, and closes with the session. Host keys are
  trusted on first use like OpenSSH: sqldoro shows the SHA256 fingerprint the first time and warns
  loudly if it changes.
- **Secrets**: passwords and passphrases live only in VS Code's `SecretStorage`; the rest of a
  connection is saved in the extension's global state (not synced). Errors and logs never show them.
- **Schema explorer**: connection → databases → schemas (PostgreSQL) → tables and views → columns,
  indexes and foreign keys, loaded when a node opens. **Filter** shows only the tables and views whose
  name contains some text; **Refresh** reloads a node or everything.

## Planned v1 scope

- **Engines**: MySQL and PostgreSQL.
- **Connections**: saved connections with SSH tunnels and SSL/TLS. Passwords and keys live in VS Code
  `SecretStorage`, never in settings files.
- **Schema tree**: databases, schemas, tables, views, columns, indexes and the rest of the catalog.
- **SQL editor** with schema-aware autocomplete.
- **Result grid**: virtualized, fast on large result sets.
- **Inline editing** of results, with a preview of the SQL it will run before anything changes.
- **Tooling**: DDL of any object, `EXPLAIN`, query history and saved queries.
- **Safety guards**:
  - read-only by default: writing is something you turn on per connection;
  - `UPDATE` and `DELETE` without a `WHERE` are blocked;
  - environment tags (local, staging, production) that make it obvious where you are;
  - manual transactions: you decide when to commit or roll back;
  - automatic `LIMIT` on queries that would return everything.

### Out of scope for v1

ER diagrams, schema diff, data compare, an import wizard, NoSQL databases, engines other than MySQL
and PostgreSQL, an MCP server, and telemetry.

## Privacy

sqldoro has no telemetry, ever: no analytics, no crash reports, no network calls other than the
connections you configure to your own databases.

## Development

Requirements: Node.js 24 (the runtime of the VS Code extension host; `package.json` declares it in
`devEngines`, and npm refuses other versions), npm, VS Code to run the extension, and Docker with
Compose for the integration tests.

```sh
make setup        # npm ci (locked dependencies, no install scripts) and the git hooks
make quality      # every static check and the unit tests
make integration  # the drivers and the SSH tunnel against real servers (Docker)
```

Press **F5** in VS Code ("Run Extension") to build the extension and open it in an Extension
Development Host, then open the **sqldoro** view in the activity bar. `make integration` leaves its
servers running: connect the Extension Development Host to them (see
[Integration tests](#integration-tests-make-integration) for their ports and credentials).

### Commands

| Command                 | Description                                                                         |
| ----------------------- | ----------------------------------------------------------------------------------- |
| `make setup`            | Install the locked dependencies and the git hooks.                                  |
| `make build`            | Bundle the extension into `dist/extension.cjs` (esbuild).                           |
| `make format`           | Format every file (Prettier) and apply the fixes ESLint can make.                   |
| `make lint`             | ESLint (strict type-checked, complexity and security rules) and the Prettier check. |
| `make typecheck`        | tsc 7 strict on the whole project, then on the platform-agnostic core alone.        |
| `make test`             | Unit tests with coverage (Vitest); thresholds at 100% that only go up.              |
| `make lint-arch`        | Architecture contracts (dependency-cruiser).                                        |
| `make dead-code`        | Unused files, exports, dependencies and stale configuration (knip).                 |
| `make audit`            | Known vulnerabilities in the dependencies (`npm audit`).                            |
| `make quality`          | All of the above: what the pre-commit hook runs.                                    |
| `make integration`      | Start the test servers (Docker Compose) and run the integration tests.              |
| `make integration-down` | Stop and remove the integration test servers.                                       |
| `make smoke`            | Build and run the extension in a real VS Code (see below).                          |
| `make mutation`         | Mutation testing of the whole core (Stryker; slow, weekly in CI).                   |
| `make mutation-changed` | Mutation testing of the core files changed against `BASE` (default `origin/main`).  |
| `make all`              | Everything CI runs on a pull request.                                               |

### Architecture

```
src/
├── core/        # Engine interface, connection model, validation, URL import, session opening: pure TypeScript
├── drivers/     # One folder per database (mysql/ with mysql2, postgres/ with pg) implementing the engine interface
├── tunnel/      # The SSH tunnel (ssh2) implementing the core tunnel interface
├── extension/   # VS Code extension host: activation, commands, the Connections view, storage, the form
│   └── factories/   # the only place that instantiates the drivers and the SSH tunnel
└── webview/     # React result grid, a browser bundle loaded by the webview (later phase)
scripts/         # CI tooling: build, smoke launcher, mutation runner and the Quality Report
test/            # Test support: fakes, the vscode fake, the integration servers and the VS Code suite
```

The core is the center: drivers implement its `Engine` interface, the SSH tunnel its `TunnelOpener`
interface, and the extension host talks to databases only through them. The core never imports
`vscode`, Node.js built-ins or database, SSH and UI libraries, because it also runs in the webview.
These rules are contracts checked on every commit (see
[Architecture contracts](#architecture-contracts-make-lint-arch)); `CLAUDE.md` lists them in full.

**Opening a session.** `openSession` (core) reads the certificate files through the platform, opens
the SSH tunnel when the connection has one (asking the extension whether the host key is trusted),
then asks the driver to connect to the tunnel's local end or straight to the database. If the driver
fails, the tunnel closes; closing the session closes the driver session, then the tunnel. When the
server or the network ends a session, the extension marks the connection as failed and says so.

**Adding an engine.** The core knows engines only through `EngineRegistry`: an engine brings its id,
name, default port, URL schemes and dialect (identifier quote, whether it has schemas), and connects.
Supporting another database means writing its driver and registering it in
`src/extension/factories/engines.ts`; nothing else in the core or the extension changes.

**Exact values.** Drivers keep `DECIMAL`/`NUMERIC` and `BIGINT` as the text the server sent, dates
and JSON as the server formats them, and binary data as hexadecimal text: nothing depends on the time
zone of the machine or loses precision. Queries stream their rows in batches and keep at most a given
number of them; cancelling one stops it from another connection (`KILL QUERY` in MySQL,
`pg_cancel_backend` in PostgreSQL).

## Quality pipeline

The pipeline is a TypeScript port of [py-awesome-template](https://github.com/mathmed/py-awesome-template)'s:
the same layers, strict from day one, with no baseline. Code is refactored to meet the gates; the
gates are never loosened to meet the code.

| Layer              | Tool                                                                                                                                                                                                           | Runs in                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Lint               | ESLint 10 with typescript-eslint `strictTypeChecked` + `stylisticTypeChecked`, SonarJS, perfectionist (import order), eslint-comments; every rule an error, `--max-warnings 0`                                 | pre-commit, `lint` job         |
| Format             | Prettier                                                                                                                                                                                                       | pre-commit, `lint` job         |
| Types              | tsc 7 (native), `strict` plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `erasableSyntaxOnly`; the core also without platform types | pre-commit, `quality` job      |
| Complexity         | ESLint: cyclomatic complexity 5 (xenon A), cognitive complexity 5, nesting depth 2, 30 lines per function, 3 parameters, 300 lines per file; cannot be disabled inline                                         | pre-commit, `lint` job         |
| Security           | eslint-plugin-security (as errors), eslint-plugin-no-unsanitized, SonarJS security hotspots, bans on shell execution and `eval`; `npm audit`                                                                   | pre-commit, `lint`/`quality`   |
| Dead code          | knip, configuration hints as errors                                                                                                                                                                            | pre-commit, `quality` job      |
| Tests and coverage | Vitest with V8 coverage, 100% statements, branches, functions and lines as a ratchet                                                                                                                           | pre-commit, `quality` job      |
| Integration        | Vitest against real MySQL 8.4, PostgreSQL 18 and OpenSSH servers (service containers in CI, Docker Compose locally)                                                                                            | `integration` job              |
| Architecture       | dependency-cruiser contracts                                                                                                                                                                                   | pre-commit, `architecture` job |
| Smoke              | the built extension in a real VS Code (`@vscode/test-electron`, xvfb in CI)                                                                                                                                    | `smoke` job                    |
| Mutation testing   | Stryker, changed core files on PRs, whole core weekly, `MUTATION_MIN_SCORE` ratchet                                                                                                                            | `mutation` workflow            |
| Report             | one Quality Report comment per PR, built from the fragments of every job                                                                                                                                       | `quality-report` job           |

Git hooks run through [lefthook](https://lefthook.dev/): pre-commit formats the staged files and runs
`make quality`'s checks in parallel; commit-msg enforces Conventional Commits. Dependabot proposes
grouped weekly updates after a cooldown (major 15 days, minor 10, patch 5).

### Integration tests (`make integration`)

Unit tests stand in for the database servers with fakes of the client libraries (`test/fakes/`);
the integration tests run the drivers and the SSH tunnel against real servers instead:
`src/**/*.integration.test.ts` and `test/integration/*.integration.test.ts`, run by
`vitest.integration.config.ts`. `make integration` starts the servers of
`test/integration/compose.yaml` with Docker Compose (and leaves them running), then runs the tests;
CI starts the same images as service containers of the `integration` job.

| Server     | Image                       | Address           | User / password        | Database  |
| ---------- | --------------------------- | ----------------- | ---------------------- | --------- |
| MySQL      | `mysql:8.4.11`              | `127.0.0.1:33306` | `sqldoro / sqldoro-it` | `sqldoro` |
| PostgreSQL | `postgres:18.6-alpine`      | `127.0.0.1:35432` | `sqldoro / sqldoro-it` | `sqldoro` |
| OpenSSH    | `testcontainers/sshd:1.3.0` | `127.0.0.1:32222` | `root / sqldoro-it`    |           |

These are throwaway credentials of local test containers. The SSH server reaches the databases as
`mysql:3306` and `postgres:5432`. Each address can be overridden with `SQLDORO_IT_<SERVER>_HOST` and
`SQLDORO_IT_<SERVER>_PORT` (`MYSQL`, `POSTGRES`, `SSH`). The tests create their own tables and
schemas, wait for the servers to accept connections, and generate their SSH keys on the fly: no
private key is stored in the repository.

### Extension smoke test (`make smoke`)

`scripts/smoke.ts` downloads VS Code (latest stable, or `SMOKE_VSCODE_VERSION`) with
[`@vscode/test-electron`](https://github.com/microsoft/vscode-test), starts it with the built
extension (`dist/`) in a fresh profile without telemetry, and runs `test/smoke/suite.ts` inside it:
the extension must activate, every command and view contributed in `package.json` must be registered
(each view opens and refreshes), and `sqldoro.hello` must answer. Each step prints a `>> ` line (VS Code version, activation time,
commands) that the Quality Report summarises. Linux needs a display: CI wraps it in `xvfb-run`, and
`make smoke` does the same on a headless machine that has it installed.

### Architecture contracts (`make lint-arch`)

[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) checks the imports of `src/`,
`scripts/` and `test/` against `.dependency-cruiser.mjs`:

- the core depends on no other layer, no `vscode`, no Node.js built-in and no database, SSH or UI
  library;
- drivers depend only on the core and their database client, never on each other, the tunnel, the
  SSH client, the extension host, the webview or `vscode`;
- the SSH tunnel depends only on the core, `ssh2` and Node.js, never on a driver, a database client,
  the extension host, the webview or `vscode`;
- only `src/extension/factories/` instantiates the drivers and the SSH tunnel;
- the extension host and the webview never import each other, and the webview uses no `vscode`,
  Node.js built-in, tunnel, database or SSH client;
- no circular dependencies, no product code importing CI scripts or tests (and the reverse), no
  devDependency in the shipped code, no undeclared or unresolvable import.

When a contract breaks, fix the import. Only relax a contract as a deliberate architecture decision
approved by the owner, never to make a check pass.

### Mutation testing (`make mutation`)

[Stryker](https://stryker-mutator.io/) changes the core code (flips a condition, empties a string,
removes a block...) and runs the unit tests against each change. A mutant that no test notices is a
**survivor**: that code runs, but its behaviour is not asserted. Coverage says the line ran; mutation
testing says whether a test would notice if it were wrong. The TypeScript checker discards mutants
that do not compile.

The scope is `src/core` (the engine interface and the safety guards), set by `mutate` in
`stryker.config.mjs`; drivers, the extension host and the webview are covered by unit and smoke tests.
The `Mutation testing` workflow runs:

- **on every PR**, through `ci.yml`, mutating only the core files changed in the diff
  (`git diff origin/<base>...HEAD`); when no core file changed it ends in seconds with "nothing to
  mutate";
- **weekly** (and on demand via `workflow_dispatch`) on the whole core.

The job fails when the score is below `MUTATION_MIN_SCORE`, a repository variable (Settings → Secrets
and variables → Actions → Variables, default `95`) that works as a ratchet: raise it as the score
allows, never lower it to get a PR green. Survivors appear in the Quality Report and the job summary
with file, line, mutator and replacement; the HTML report is uploaded as the `mutation-report`
artifact and written to `reports/mutation/` locally. For each survivor, add the missing assertion.

Stryker's Vitest runner cannot select tests on Vitest 5 yet
([stryker-js#6210](https://github.com/stryker-mutator/stryker-js/issues/6210): every covered mutant
would "survive"), so mutants run through Stryker's command runner, one fresh Vitest process each,
running the tests of the core (where every mutant lives): the tests of the other layers open real SSH
sessions and would only make each run slower. Switch back to the Vitest runner with `perTest`
coverage once that fix is released.

## Quality Report

Every pull request gets **one** comment (marker `<!-- quality-report -->`, updated in place on every
push) with the verdict, a status table and a section per analysis: ✅ ok, ⚠️ warning, ❌ failed,
⏭️ not run (job cancelled or skipped, or nothing to do, such as no core file changed for mutation
testing). Long output goes inside collapsible `<details>` blocks, trimmed to fit in a GitHub comment.

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
| Extension smoke    | esbuild + VS Code        | `smoke`          | bundle size, VS Code version, activation time, registered commands, views |
| Mutation testing   | Stryker (`mutation.yml`) | `mutation`       | score vs. ratchet, killed and surviving mutants by file, line and mutator |

**How it works.** Each analysis runs through `node scripts/quality-report.ts run <analysis> -- <command>`.
The wrapper streams the output, returns the tool's own exit code (the job is still the gate; the report
never decides what blocks) and saves a fragment, `quality-fragments/<analysis>.json`, which the job
uploads as the `quality-fragment-<job>` artifact. The final `quality-report` job (needs every analysis
job, runs `if: always()`, only on PRs, with `pull-requests: write`) downloads the fragments, renders
the report with `node scripts/quality-report.ts render` and upserts the comment. A job that failed,
was cancelled or produced no fragment appears as ❌ or ⏭️ instead of breaking the report. The report is
also written to the job summary, the fallback for PRs from forks, where the token is read-only and
posting the comment only emits a warning. The script uses only Node.js built-ins, so the report job
needs no `npm ci`. ESLint runs once: the report splits its problems into the Lint, Complexity and
Security sections by rule.

**Fragment contract.** A fragment is a JSON file
`{"analysis": "<id>", "exitCode": 0, "output": "<tool output>", "seconds": 1.2}`. The renderer parses
`output` with one analyzer per tool (`scripts/quality-report/analyzers/`), each tested against real
output of its tool. Mutation testing also prints a `MUTATION_RESULT: {json}` line, whose format is
shared by the mutation script and its analyzer (`scripts/shared/mutation-result.ts`).

**Adding an analysis.**

1. Add a value to `Analysis` (`scripts/quality-report/analysis.ts`), write an analyzer in
   `scripts/quality-report/analyzers/` with its tests, and add a `Check` to `SECTIONS`
   (`scripts/quality-report/sections.ts`).
2. Run the tool in its CI job as `node scripts/quality-report.ts run <analysis> -- <command>` and upload
   `quality-fragments/` as the `quality-fragment-<job>` artifact with `if: ${{ !cancelled() }}`.
3. Add the job to the `needs` of `quality-report`.

Render locally from fragments: `node scripts/quality-report.ts render --dir quality-fragments`.

## Configuration files

| File                                   | Description                                                           |
| -------------------------------------- | --------------------------------------------------------------------- |
| `package.json`                         | Extension manifest, npm scripts and dependencies.                     |
| `tsconfig.json` / `tsconfig.core.json` | Strict compiler options; the core checked without platform types.     |
| `eslint.config.ts`                     | Lint, complexity and security rules.                                  |
| `.prettierrc.json`                     | Formatting.                                                           |
| `vitest.config.ts`                     | Unit tests and the coverage ratchet.                                  |
| `vitest.integration.config.ts`         | Integration tests against real servers.                               |
| `test/integration/compose.yaml`        | MySQL, PostgreSQL and OpenSSH for the integration tests.              |
| `media/`                               | The activity bar icon.                                                |
| `.dependency-cruiser.mjs`              | Architecture contracts.                                               |
| `knip.jsonc`                           | Dead code analysis: entry points and project files.                   |
| `stryker.config.mjs`                   | Mutation testing scope and runner.                                    |
| `lefthook.yml`                         | Git hooks: pre-commit checks and the Conventional Commits check.      |
| `.npmrc`                               | npm never runs the install scripts of dependencies.                   |
| `scripts/`                             | Build, smoke launcher, mutation runner and the Quality Report.        |
| `.github/workflows/ci.yml`             | One job per group of analyses plus the `quality-report` job.          |
| `.github/workflows/mutation.yml`       | Mutation testing on PRs (changed files), weekly and on demand.        |
| `.github/dependabot.yaml`              | Grouped weekly updates with a cooldown, and the pinned exceptions.    |
| `.vscode/`                             | Launch configuration (F5), format on save and recommended extensions. |
| `CLAUDE.md` / `AGENTS.md`              | Rules for AI coding agents.                                           |
| `.claude/`                             | Claude Code agents, permissions and the format-and-lint hook.         |

## License

MIT, see [LICENSE](LICENSE).

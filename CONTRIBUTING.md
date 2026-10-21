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

| Command                    | Description                                                                |
| -------------------------- | -------------------------------------------------------------------------- |
| `make setup`               | Install the locked dependencies and the git hooks.                         |
| `make build`               | Bundle the extension (esbuild) and the webviews (Vite) into `dist/`.       |
| `make package`             | Build, then pack and check `sqldoro-<version>.vsix`.                       |
| `make format`              | Format (Prettier) and apply the fixes ESLint can make.                     |
| `make lint`                | ESLint and the Prettier check.                                             |
| `make typecheck`           | tsc 7 strict: the whole project, then the core alone.                      |
| `make test`                | Unit tests with coverage (100%, a ratchet).                                |
| `make lint-arch`           | Architecture contracts (dependency-cruiser).                               |
| `make dead-code`           | Unused files, exports and dependencies (knip).                             |
| `make audit`               | Known vulnerabilities in the dependencies.                                 |
| `make suppressions`        | Suppression ratchet against `suppressions-baseline.json`.                  |
| `make quality`             | All of the above but the build: what the pre-commit hook runs.             |
| `make integration`         | Start the test servers (Docker Compose) and run the integration tests.     |
| `make integration-down`    | Stop and remove the integration test servers.                              |
| `make smoke`               | Pack the extension and run it in a real VS Code.                           |
| `make mutation`            | Mutation testing of the whole core (slow; weekly in CI).                   |
| `make mutation-changed`    | Mutation testing of the core files changed against `BASE` (`origin/main`). |
| `make suppressions-update` | Lower the suppression baseline after removing suppressions.                |
| `make risk-labels`         | Create or update the `risk:<level>` labels on GitHub (needs `gh`).         |
| `make all`                 | Everything CI runs on a pull request.                                      |

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
5. Open the pull request with the template and one `risk:<level>` label (see
   [The risk label](#the-risk-label) and [Pull request flow](#pull-request-flow)). CI posts one **Quality Report**
   comment; a failing check means it is not ready.

Contributed commands, settings and views are the public contract: do not remove or rename one unless
that is the point of the change. Every statement a user or the grid runs goes through the safety
guards ([docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#the-guard-layer));
`src/extension/safety/guarded-execution.test.ts` fails on any new place that runs SQL.

## The pipeline

Strict from day one, with no baseline (a TypeScript port of
[py-awesome-template](https://github.com/mathmed/py-awesome-template)'s). Code is refactored to meet
the gates; relaxing a threshold, rule or contract needs the owner's explicit approval.

| Gate               | Tool                                                           | Guarantees                                                                                         | Runs in                      |
| ------------------ | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | ---------------------------- |
| Lint and format    | ESLint (typescript-eslint strict, SonarJS, security), Prettier | Every rule an error, `--max-warnings 0`; a disable needs a reason.                                 | pre-commit, `lint`           |
| Complexity         | ESLint                                                         | Complexity 5, nesting 2, 30 lines per function, 3 parameters, 300 lines per file; never disabled.  | pre-commit, `lint`           |
| Types              | tsc 7 strict, plus the extra flags of `tsconfig.json`          | No `any`; the core type-checks without Node.js or DOM types.                                       | pre-commit, `quality`        |
| Security           | eslint-plugin-security, no-unsanitized, `npm audit`            | No shell, `eval` or unsanitized HTML; no known vulnerable dependency.                              | pre-commit, `lint`/`quality` |
| Dead code          | knip                                                           | No unused file, export or dependency, no stale configuration.                                      | pre-commit, `quality`        |
| Tests and coverage | Vitest (Node.js; jsdom and Testing Library for the webview)    | 100% statements, branches, functions and lines, as a ratchet.                                      | pre-commit, `quality`        |
| Integration        | Vitest against MySQL 8.4, PostgreSQL 18 and OpenSSH            | Drivers, tunnel and extension host behave on real servers.                                         | `integration`                |
| Architecture       | dependency-cruiser                                             | The layer contracts of `.dependency-cruiser.mjs`.                                                  | pre-commit, `architecture`   |
| Build and package  | esbuild, Vite, vsce, `scripts/package/`                        | The `.vsix` holds exactly what it should, with shippable licenses, under its budget.               | `package`                    |
| Smoke              | `@vscode/test-electron` (xvfb in CI)                           | The packaged `.vsix` installs, activates, registers every command and view, loads its webviews.    | `smoke`                      |
| Mutation testing   | Stryker on `src/core`                                          | The score stays above `MUTATION_MIN_SCORE` (95).                                                   | `mutation` workflow          |
| Suppressions       | `scripts/suppressions.ts`                                      | No new `eslint-disable`, `@ts-expect-error`, coverage or mutation pragma, skipped or focused test. | pre-commit, `lint`           |
| Risk label         | `scripts/risk.ts`                                              | Exactly one known `risk:<level>` label per PR.                                                     | `Risk label` workflow        |
| Report             | `scripts/quality-report.ts`                                    | One Quality Report comment per pull request.                                                       | `quality-report`             |

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
  `sqldoro-vsix` artifact; releases (**Actions → Release → Run workflow**) are in
  [`docs/RELEASING.md`](docs/RELEASING.md).
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

### Suppression ratchet

`scripts/suppressions.ts` counts, per file and per kind, every suppression in the source files git
tracks or would add (`.ts`, `.tsx` and the other JavaScript extensions), and compares the counts with
the committed `suppressions-baseline.json`:

| Kind                                           | Matches                                                                         |
| ---------------------------------------------- | ------------------------------------------------------------------------------- |
| `eslint-disable` / `eslint-config`             | `eslint-disable`, `-line`, `-next-line`; inline `/* eslint rule: off */` config |
| `ts-ignore` / `ts-expect-error` / `ts-nocheck` | the TypeScript directives                                                       |
| `coverage-ignore` / `stryker-disable`          | `v8`, `c8` and `istanbul ignore`; `Stryker disable`                             |
| `prettier-ignore` / `knip-tag`                 | `prettier-ignore`; the JSDoc tags knip never reports (`@public`, `@beta`...)    |
| `test-skip` / `test-fails` / `test-focus`      | `.skip`, `.skipIf`, `.runIf`, `.todo`, `xit`; `.fails`; `.only`, `fit`          |

Comments and test calls are read with the TypeScript parser (`@typescript-eslint/typescript-estree`),
so the same text in a string does not count; files that hold none of the words are not parsed.

- **A count went up** (a new suppression, or one moved to another file): the check fails and lists the
  file, kind and lines. Remove it and fix the cause. Raising the baseline
  (`npm run suppressions:update -- --allow-increase`) needs the owner's explicit approval, and shows in
  the diff.
- **A count went down**: the check fails too until you run `make suppressions-update` and commit the
  lower baseline in the same PR, so the improvement is locked in.

It runs in `make quality`, the pre-commit hook and the `lint` job, and prints a `SUPPRESSIONS_RESULT`
line for the Quality Report. Configuration that disables a check for the whole project is not counted:
call such a change out in the PR.

### The risk label

Every PR carries exactly one `risk:low`, `risk:medium`, `risk:high` or `risk:critical` label. The level
is a judgment of the `pr-writer` agent (or the person opening the PR), following the rubric in
`.claude/agents/pr-writer.md`: most PRs are low or medium; high is for changes that can break the
extension for its users or change existing behavior drastically; critical is for changes where a failure
can run a destructive statement or weaken a safety lock (see "Critical surfaces" in `CLAUDE.md`). High
and critical need one concrete sentence in the Risk line naming what can break. Touching pipeline files is
not by itself a reason for high.

The **Risk label** workflow (`.github/workflows/risk-label.yml`) runs `scripts/risk.ts check` on every
push and label change and fails when a PR has no risk label, more than one, or an unknown one. It lives
outside `ci.yml` so that a label change does not re-run every analysis, and is not part of the Quality
Report. `make risk-labels` creates the labels (idempotent); Dependabot's PRs get `risk:low`.

### Pull request flow

Reading AI-written diffs is the bottleneck, so the PR description is short and says what changed in
behavior, written by an agent that did not write the code (`CLAUDE.md`, "Workflow"); the risk label says
how much attention the PR deserves:

1. **`coder`** implements on a branch, runs the checks, commits one logical step per commit, pushes and
   writes handoff notes to `.handoff/<branch>.md` (gitignored), with an explicit **Not verified** list.
2. **`pr-writer`** (Opus) reads the diff commit by commit, checks every claim against the diff and the
   tests, assigns the risk by judgment (mostly low or medium; at least medium with a release step) and
   fills `.github/pull_request_template.md`: a summary of one or two sentences that stands alone, at most
   one visual block chosen by the kind of change (a `What | Before | After` table in plain words, a small
   Mermaid diagram, a before/after table of values or a short diff), a `Deploy:` line only when there is a
   real release step, a `Risk high: <what can break>` first line only for high or critical, and a
   `Divergence:` line only when the diff contradicts the notes. No empty headings, filler, file lists or
   footer; at most 2,500 characters. It opens the PR with the label and stops.
3. If `pr-writer` fails, `coder` opens the PR with a minimal body and no label; the Risk label check
   stays red until a person sets one. Only the owner merges.

People opening PRs by hand get the same template from GitHub.

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

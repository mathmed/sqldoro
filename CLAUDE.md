# CLAUDE.md

Guidance for AI coding agents working in this repository. `AGENTS.md` is a symlink to this file, so
Cursor, Codex and other tools that read `AGENTS.md` follow the same rules.

## Project

**sqldoro** is an open-source (MIT) VS Code extension: a database client for MySQL and PostgreSQL.
TypeScript on Node.js 24 (the runtime of the VS Code extension host), managed with npm. See the
README for the v1 scope and what is deliberately out of it.

## Commands

```bash
make setup             # install the locked dependencies and the git hooks
make build             # bundle the extension (esbuild) and the result view (Vite) into dist/
make package           # build, then pack and check sqldoro-<version>.vsix (vsce)
make format            # format with Prettier and apply the fixes ESLint can make
make lint              # ESLint (strict, complexity and security rules) and the Prettier check
make typecheck         # tsc 7 strict: the whole project, then the platform-agnostic core alone
make test              # unit tests with coverage (Vitest; thresholds are a ratchet at 100%)
make lint-arch         # architecture contracts (dependency-cruiser)
make dead-code         # unused files, exports and dependencies (knip)
make audit             # known vulnerabilities in the dependencies (npm audit)
make quality           # all of the above: what the pre-commit hook and the CI static jobs run
make integration       # start the test servers (Docker Compose), run the integration tests against them
make integration-down  # stop and remove the integration test servers
make smoke             # pack, then install the .vsix in a real VS Code and run the smoke suite
make mutation          # mutation testing of the whole core (slow; weekly in CI)
make mutation-changed  # mutation testing of the core files changed vs BASE (default origin/main); runs on every PR
make all               # everything CI runs on a pull request
```

Debug the extension with F5 in VS Code ("Run Extension" opens an Extension Development Host).
Always use `npm ci` / `npm install` (never another package manager) and commit `package-lock.json`.

## Architecture rules

```
src/core/       engine interface, shared types and safety guards: pure TypeScript, no platform API
src/drivers/    one folder per database (mysql/, postgres/) implementing the core engine interface
src/tunnel/     the SSH tunnel (ssh2) implementing the core tunnel interface
src/extension/  VS Code extension host: activation, commands, views, SecretStorage; factories/ wires drivers
src/webview/    React webviews, browser bundles built by Vite: the result grid (TanStack), connection-form/
scripts/        CI tooling: build, packaging, smoke launcher, release checks, mutation runner, Quality Report
test/           test support: the vscode and webview fakes for unit tests and the suite that runs inside VS Code
```

- `src/core` imports nothing from `drivers`, `extension` or `webview`, and neither `vscode`, Node.js
  built-ins (it also runs in the webview) nor database, SSH or UI libraries. Platform services reach it
  through interfaces it declares. `make typecheck` checks it without Node.js or DOM types.
- A driver implements the core engine interface and imports only the core and its own database client.
  Drivers never import each other, the tunnel, the SSH client, `vscode`, the extension host or the
  webview. The core opens the SSH tunnel and hands the driver an endpoint.
- The SSH tunnel implements the core tunnel interface and imports only the core, `ssh2` and Node.js.
- The extension host talks to databases through the core engine and tunnel interfaces; only
  `src/extension/factories/` instantiates concrete drivers and the SSH tunnel. Supporting another
  engine means writing its driver and registering it in `src/extension/factories/engines.ts`.
- The extension host and the webview never import each other: they share types and the message
  protocol through the core (`src/core/results/protocol.ts`), and each side validates every message it
  receives with the core parsers. The webview never imports `vscode` (it uses `acquireVsCodeApi()`),
  Node.js built-ins or database clients. UI libraries (React, TanStack) are only imported by the
  webview. The rows stay in the extension host: the webview asks for windows of them and only shows
  them; sorting, filtering, copying and exporting run in the host.
- Product code never imports `scripts/` or `test/`, and the scripts never import the product.
- Unit tests live next to the code (`greeting.test.ts` beside `greeting.ts`). The `vscode` module only
  exists inside VS Code: unit tests get the fake in `test/vscode.ts` (extend it when the extension uses
  more of the API), and the smoke test exercises the real one. Webview tests (`*.test.tsx`) run in
  jsdom with Testing Library (the `webview` Vitest project): they render the components, act like the
  user and stand in for VS Code with `fakeVsCodeApi()` and `fromHost()` from
  `test/webview/vscode-api.ts`; `test/webview/setup.ts` gives elements a panel's size, since jsdom lays
  nothing out.
- Every statement a user or the grid runs goes through the safety guards: build a `RunWork` with
  every statement it may execute and run it through `QueryRunner.perform`; `StatementGuard`
  classifies, applies the guards and confirms, and `QueryRunner.runJob` refuses SQL the guard did not
  approve. The inline edits do the same: their `RunWork` lists the statements of the plan, and
  `edits/edit-batch.ts` asks `approval.classOf` for each one before it runs. Never call
  `EngineSession.execute` with user SQL anywhere else: `src/extension/safety/guarded-execution.test.ts`
  pins every call site and fails on a new one. Only sqldoro's own statements (catalog queries,
  `START TRANSACTION`, `COMMIT`, `ROLLBACK`, the savepoint statements of an apply, the transaction
  status probe) bypass the guard. The classifier, the guard policy, the automatic `LIMIT` and the
  transaction state machine live in `src/core/safety/` as pure functions; what differs between
  engines is declared by their `Dialect`.
- Editing results is decided and planned in `src/core/edits/` (pure functions: what can be edited,
  the pending changes, their statements and outcomes) from what the drivers report: the origin of
  each result column and `EngineSession.describeTable`. It fails closed: what the analysis cannot
  prove editable is read-only. Generated statements bind every value as a parameter, with the cast
  the driver declares for its column (`ValueSql`), so that no value is cut or rounded.
- Contributed commands are declared in `package.json` (`contributes.commands`) with their id in
  `src/extension/command-id.ts`. The smoke test fails when a contributed command is not registered on
  activation.
- CI analyses never post comments on their own: each job runs its tool through
  `node scripts/quality-report.ts run <analysis> -- <command>` and uploads the fragment; the
  `quality-report` job builds the single PR comment. A new analysis needs an `Analysis` value, an
  analyzer, a `Check` in `SECTIONS`, the wrapper and the artifact in its job, the job in the `needs` of
  `quality-report`, and tests (see CONTRIBUTING.md, "Quality Report"). The wrapper keeps the tool's exit
  code: the job stays the gate.
- Every change comes with tests.
- Driver and network code:
  - every event emitter of a client library (database connections, sockets, SSH clients and
    channels) gets an `error` listener as soon as it exists: an unhandled `error` event would crash
    the extension host;
  - nothing parses, validates or throws inside a library callback or event handler: resolve with the
    raw value and validate after `await`, or record the failure and settle once;
  - certificates are verified against the database host name, also through the SSH tunnel;
  - unit tests stand in for the database servers with the fakes of the client libraries in
    `test/fakes/` (the external boundary); the integration tests run against real servers.

## Before opening a PR (mandatory)

1. `make quality` passes. A PR with failing checks is not a PR.
2. `make smoke` passes when the change touches the extension host, the manifest or the build.
3. `make mutation-changed` passes when the change touches `src/core`.
4. `make integration` passes when the change touches the drivers, the tunnel or how the core opens a
   session (it needs Docker).
5. Contributed commands, settings and views are not removed or renamed unless the task asks for it:
   they are the public contract of the extension.
6. The docs are updated if the change affects setup, commands, settings, scope or architecture: the
   README for users (`src/extension/manifest-docs.test.ts` checks its commands and settings),
   `CONTRIBUTING.md` for development, `docs/ARCHITECTURE.md`, and `CHANGELOG.md` under
   `[Unreleased]`.
7. The PR follows `.github/pull_request_template.md` and carries exactly one `risk:<level>` label at or
   above `make risk-floor` (see "Workflow").

## Deterministic validation

The pipeline started at zero: no baseline, no ignore list, no known violations. When a check fails,
change the code, never the check. Relaxing, removing or adding an exception to any threshold, rule or
contract needs the owner's explicit approval.

- **ESLint**: typescript-eslint `strictTypeChecked` and `stylisticTypeChecked`, SonarJS, the security
  rules and the project rules in `eslint.config.ts`, every one an error, `--max-warnings 0`. The
  complexity limits (cyclomatic complexity 5 like xenon A, cognitive complexity 5, nesting depth 2,
  30 lines per function, 3 parameters, 300 lines per file) cannot be disabled inline: split the code.
  Any other `eslint-disable` needs a `-- reason`, `@ts-expect-error` needs a description and
  `@ts-ignore` is banned. Coverage and mutation pragmas (`v8 ignore`, `Stryker disable`) are rejected
  unless they come with a disable and its reason.
- **tsc 7**: `strict` plus `exactOptionalPropertyTypes`, `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `noPropertyAccessFromIndexSignature`, `noUnused*`, `erasableSyntaxOnly` and
  `verbatimModuleSyntax`. TypeScript 6 is installed beside it (`typescript` is an npm alias of
  `@typescript/typescript6`) only because typescript-eslint, Stryker and dependency-cruiser still need
  its API: remove it once they support TypeScript 7.
- **Architecture**: `make lint-arch` enforces the rules above (`.dependency-cruiser.mjs`). If it fails,
  fix the import, not the contract.
- **Coverage**: 100% of statements, branches, functions and lines, as a ratchet (Vitest `autoUpdate`
  only ever raises the numbers in `vitest.config.ts`). Write the missing test or remove the unreachable
  code. Only the command-line entry points `scripts/*.ts` are excluded: CI runs them for real.
- **Package**: `make package` packs the `.vsix` and checks it against `scripts/package/vsix-rules.ts`
  (the allow list of `.vscodeignore`, the files the manifest names, a size budget); the build fails
  on a bundled library whose license is not one sqldoro can ship. A new runtime file goes into both
  `.vscodeignore` and the rules.
- **Smoke**: `make smoke` installs the packaged `.vsix` in a real VS Code. It must activate, register
  every contributed command and view and answer `sqldoro.hello`.
- **Integration**: the `integration` job runs `make integration`'s tests against real MySQL,
  PostgreSQL and OpenSSH service containers; `test/integration/compose.yaml` starts the same servers
  locally. Keep both definitions in sync.
- **Mutation testing** runs on every PR (`Mutation testing` workflow, only the `src/core` files changed
  in the diff) and weekly on the whole core. The job fails when the score is below `MUTATION_MIN_SCORE`
  (repository variable, default 95). Survivors are listed in the Quality Report and the job summary with
  file, line and mutator: add the missing assertion; never weaken or delete tests, shrink the `mutate`
  scope or lower the ratchet. Never commit `reports/` or `.stryker-tmp/`.
- **Dead code**: knip reports unused files, exports, dependencies and stale configuration. Delete the
  unused code; do not add `ignore*` entries to `knip.jsonc`.

## Workflow

1. **Implement**: code changes are delegated to the `coder` agent (`.claude/agents/coder.md`), which
   creates a branch, implements, commits (one commit per logical step), pushes and writes the handoff
   notes. It does not open the PR and does not assess the risk. Never commit directly to `main`.
2. **Describe and open**: then delegate to the `pr-writer` agent (`.claude/agents/pr-writer.md`) with the
   original task verbatim, the branch, the base branch and the path of the handoff notes. It reads the
   diff cold, commit by commit, fills `.github/pull_request_template.md`, assigns the risk level (never
   below `make risk-floor`, at least medium when there are deploy steps), opens the PR with the
   `risk:<level>` label and stops. It never writes code. Behavior items are plain language with no file,
   function, test or code references; their evidence pointers go only in **Look here**, and a behavior
   without evidence is listed under **Not verified**. For sqldoro, the **Deploy steps** are release
   steps (`docs/RELEASING.md`).
3. **Fallback**: if `pr-writer` fails or cannot run, delegate back to `coder` saying so: it opens the PR
   itself with a minimal body (summary plus the template headings, risk "unassessed", no risk label),
   so a failure never blocks delivery. The `Risk label` check stays red until a person sets the label.
4. **Merge**: nobody but the owner merges. Agents never merge, approve or enable auto-merge.

- **Exception**: if a `.local_dev` file exists at the repository root, the developer is working locally:
  edit files directly, without delegating to `coder` or `pr-writer` and without creating commits or PRs.
- Use the `reviewer` agent (`.claude/agents/reviewer.md`) to review a branch against these rules before
  merging.

### Handoff notes

The `coder` writes them to `.handoff/<branch>.md` (every `/` of the branch name replaced with `-`; the
directory is gitignored) after pushing. `pr-writer` checks them against the diff and reports a
**Mismatch** when they disagree. Sections, in this order:

- `## Task`: the original task, verbatim.
- `## Done`: what changed and why, one line per item.
- `## Decisions`: choices made, alternatives rejected, conservative options taken on non-blocking doubts.
- `## Deploy notes`: release needs (repository variables or secrets, labels, the `CHANGELOG.md` entry,
  stored state an older version cannot read, external configuration); or "None".
- `## Not verified`: everything the author did not or could not check, and why; or "nothing".

## Personal preferences

> These are the personal preferences of the project owner, taken from py-awesome-template. Everything
> above this section describes how the project works; everything below is taste.

- **New standards**: whenever the user asks to change a code pattern, ask whether it should become a
  project standard. If yes, add it to this list so it is followed in every future conversation.
- **Reuse first (YAGNI)**: follow the existing pattern instead of inventing one. Before creating a
  function, module, interface, service or dependency, check whether one already exists and reuse it.
  When you change shared code, find and update every caller.
- **Single responsibility**: each module has one reason to change. If a module needs to import from two
  unrelated integrations, extract the dependency to an intermediary.
- **SOLID beyond SRP**: open for extension, closed for modification; depend on interfaces declared by
  the core and receive dependencies as parameters. Injected dependencies are mandatory: no optional
  parameter with a hidden default implementation.
- **DDD**: invariants, calculations and state transitions live in the core as pure functions or
  methods of its types, with no I/O. Messages between the host and the webview only carry data.
- **Index files**: only create an `index.ts` when it actually re-exports symbols. Never create empty
  placeholder files to mark folders (an empty folder keeps a `.gitkeep`).
- **Comments and docs**: no JSDoc/TSDoc on functions, methods or classes. Comments only when the code
  is genuinely confusing or the reason is not obvious from the names. Never comment what the code does.
- **Identifiers**: every identifier in English. Booleans start with `is`, `has`, `should` or `can`
  (enforced). Never prefix a class name with `_`.
- **Language**: all code, comments, logs, docs and user-facing text (including CI reports) in English.
- **Typing**: every function declares its return type (enforced). No `any`: use `unknown` and narrow
  it. Values typed `any` by an API (`extension.packageJSON`, `JSON.parse`, webview messages) are
  validated where they enter the code.
- **Fixed sets of strings**: an `as const` object plus the union of its values
  (`export const Status = { Ok: 'ok' } as const` and
  `export type Status = (typeof Status)[keyof typeof Status]`). Never a TypeScript `enum` (enforced:
  it is not erasable syntax) and never string literals spread across the code.
- **Data structures**: interfaces with `readonly` fields for structured data; `Map`/`Set` for
  collections keyed by data (column names, ids), never a plain object indexed by a variable.
- **No magic values**: limits, timeouts, truncations and URLs are named `UPPER_CASE` constants at the
  top of the module (enforced for numbers). Constant collections are `readonly` arrays or
  `ReadonlySet`/`ReadonlyMap`.
- **Exact values**: database `DECIMAL`/`NUMERIC` and `BIGINT` values are never converted to `number`:
  keep the driver's string or `bigint` so no precision is lost.
- **Dates**: never depend on the time zone of the machine; show database timestamps as the database
  returns them.
- **Edge cases**: before implementing, list the states and input values that can reach the code and
  handle each one. Irreversible effects (running a write statement, committing, dropping) happen
  exactly once, after the safety guards.
- **Idempotency**: repeating the same action (double click, retried message) never duplicates an effect.
- **Fail loudly**: never swallow errors (no empty `catch`). Catch specific errors only where something
  can be done; log unexpected errors and rethrow or translate them. Only best-effort side effects may
  continue, after logging.
- **Nothing internal leaks**: messages are written for people: no stack traces or internal ids in the
  UI. Database errors are shown with the server's message.
- **Security**: never put passwords, tokens, connection strings with credentials or personal data in
  logs, error messages, settings or the repository (the guard log names verbs, tables and
  connections, never SQL text or bound values); credentials live only in VS Code `SecretStorage`.
  Values reach SQL only through parameters, never by concatenation. Compare secrets with
  `crypto.timingSafeEqual`. Spawn processes with an argument list and no shell (enforced). Webviews get
  a strict Content Security Policy with a nonce and validate every message they receive.
- **No telemetry, ever**: no analytics, crash reporting or network calls other than the user's own
  database connections.
- **Logging**: never `console` in `src/` (enforced); the extension logs to a VS Code `OutputChannel`.
- **Configuration**: read VS Code settings through a single module of `src/extension`; never call
  `workspace.getConfiguration` anywhere else.
- **Functions**: small; a short orchestrator composes verb-named helpers. Prefer guard clauses and
  early returns over nested `if`s. Many optional parameters go in an options object.
- **Dependencies**: always use the latest available version of any external library. The exceptions
  and their reasons live in `.github/dependabot.yaml`.
- **README**: after any relevant change (new command, setting, setup step or architecture change),
  check whether the README needs updating and update it.
- **Tests**: `describe` the unit, name each case `it('should <behaviour>')` and call the object (or
  the result) under test `sut`. Mock only the external boundary (the VS Code API through
  `test/vscode.ts`, database servers, the network, the clock); never mock the project's own modules.
- **Commits**: Conventional Commits in English: `<type>: <short description>`, with `feat`, `fix`,
  `refactor`, `chore`, `test`, `docs`, `ci` or `build` (the commit-msg hook enforces it).

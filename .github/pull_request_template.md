## Risk

**<low | medium | high | critical>** — <one line: why>

<!-- Floor (.github/risk-floors.yaml, `make risk-floor`): pipeline config, storage schema, auth and secrets,
and destructive SQL safety are never below high. Any deploy step other than "None" is at least medium. The
PR needs exactly one matching risk:<level> label. -->

## Summary

<one sentence: what changes in behavior, and why>

## Behavior

<!-- Max 5, most critical first. Plain words for a person who has not read the code: rules and observable
behavior, short and objective. No backticks, paths, file, function, command, setting or test names:
evidence goes in Look here. -->

- **<rule or behavior, in plain words>:** <before> → <after>

**Unchanged:** <what a reviewer might fear broke (the safety guards, the contributed commands, settings and
views, what users saved), or "behavior-preserving refactor">

## Look here

<!-- Most important first. The only place for file, function and test references. Every Behavior item has its
evidence here: the test that asserts it, or the code that implements it when no test does (one item may
cover several Behavior items). Each item says which behavior it proves or contains and why it deserves human
eyes. Also list changes to pipeline config or checks, new suppressions or a changed suppressions baseline,
mismatches and anything that departs from the task. -->

1. `<test or file:function>` — <which behavior it proves or contains, and why it deserves human eyes>

## Deploy steps

<!-- Always present. For sqldoro, deploying is releasing: the Release workflow, the draft GitHub release, and
the Marketplace and Open VSX once publishing is switched on (docs/RELEASING.md). If nothing is needed, write:
None: normal merge and deploy. -->

- [ ] Before merge: <repository settings, variables or secrets (PUBLISH_EXTENSION, VSCE_PAT, OVSX_PAT), labels>
- [ ] Release: <CHANGELOG.md entry under [Unreleased], version bump, anything to check in the draft release>
- [ ] After release: <stored state migrated on first activation, settings users must change, Marketplace page>
- [ ] Rollback: <revert the merge and release a new patch version; what saved data an older version cannot read>

**Not verified:** <what the author could not check, or "nothing">

<!-- Name every check that did not run: `make quality` (lint, types, tests with 100% coverage, architecture,
dead code, audit, suppressions); `make smoke` when the extension host, the manifest or the build changed;
`make mutation-changed` when src/core changed; `make integration` when a driver, the tunnel or how sessions
open changed; behavior only a real VS Code, database or SSH server shows. -->
<!-- Only if the diff contradicts the author's handoff notes, add: **Mismatch:** <what the notes said vs what the diff does> -->

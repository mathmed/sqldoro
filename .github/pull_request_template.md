## What

<!-- The change, in bullet points. -->

## Why

<!-- The motivation or the issue it closes. -->

## How to test

<!-- The steps to validate it: commands, and what to try in VS Code. -->

## Checklist

- [ ] `make quality` passes (lint, types, tests with 100% coverage, architecture, dead code, audit).
- [ ] `make smoke` passes, if the extension host, the manifest or the build changed.
- [ ] `make mutation-changed` passes, if `src/core` changed.
- [ ] `make integration` passes, if a driver, the tunnel or how sessions open changed.
- [ ] Every statement a user or the grid runs still goes through the safety guards.
- [ ] No contributed command, setting or view was removed or renamed (or that is the point).
- [ ] The README, `CHANGELOG.md` (under `[Unreleased]`) and the docs say what changed.

.PHONY: setup build package format lint typecheck test lint-arch dead-code audit suppressions suppressions-update quality integration integration-down smoke mutation mutation-changed risk-floor risk-labels all

# Base branch of mutation-changed and risk-floor
BASE ?= origin/main

# VS Code needs a display: on headless Linux the smoke test runs inside xvfb-run when it is installed.
XVFB := $(if $(DISPLAY),,$(shell command -v xvfb-run >/dev/null 2>&1 && echo xvfb-run -a))

# Install the locked dependencies and the git hooks
setup:
	npm ci
	npm run hooks

# Bundle the extension into dist/ (esbuild)
build:
	npm run build

# Pack the built extension into sqldoro-<version>.vsix (vsce) and check what the package holds
package: build
	npm run package

# Format every file and apply the fixes ESLint can make on its own
format:
	npm run format
	npm run lint:fix

# Lint (ESLint: typescript-eslint strict, complexity and security rules) and check formatting (Prettier)
lint:
	npm run lint
	npm run format:check

# Type check with tsc 7: the whole project, then the platform-agnostic core on its own
typecheck:
	npm run typecheck

# Unit tests with coverage (Vitest); the thresholds are a ratchet at 100%
test:
	npm run test:coverage

# Architecture contracts (dependency-cruiser, see .dependency-cruiser.mjs)
lint-arch:
	npm run lint:arch

# Unused files, exports and dependencies (knip)
dead-code:
	npm run dead-code

# Known vulnerabilities in the dependencies
audit:
	npm audit

# Suppression ratchet: fails when the suppressions (eslint-disable, @ts-expect-error, skipped tests...)
# in the source and the tests differ from suppressions-baseline.json
suppressions:
	npm run suppressions

# Lower the baseline after removing suppressions (refuses to raise it, see CONTRIBUTING.md)
suppressions-update:
	npm run suppressions:update

# Every check of the pre-commit hook and of the lint, quality and architecture CI jobs
quality: lint typecheck test lint-arch dead-code audit suppressions

# Integration tests: the drivers and the SSH tunnel against real MySQL, PostgreSQL and SSH servers,
# started with Docker Compose (test/integration/compose.yaml) and left running for the next run
INTEGRATION_COMPOSE := docker compose -f test/integration/compose.yaml
integration:
	$(INTEGRATION_COMPOSE) up -d --wait
	npm run test:integration

# Stop and remove the integration test servers
integration-down:
	$(INTEGRATION_COMPOSE) down --volumes

# Install the package in a real VS Code: it must activate and register its commands and views
smoke: package
	$(XVFB) npm run smoke

# Mutation testing of the whole core (slow; weekly in CI). Report: reports/mutation/mutation.html
mutation:
	npm run mutation

# Mutation testing of the core files changed against BASE: what the PR job runs
mutation-changed:
	npm run mutation:changed -- --base $(BASE)

# Print the minimum risk level of the changes against BASE (.github/risk-floors.yaml)
risk-floor:
	npm run risk -- floor --base $(BASE)

# Create (or update) the risk:<level> labels, and the dependencies label Dependabot's PRs carry with
# risk:high, on the GitHub repository (needs an authenticated gh)
risk-labels:
	gh label create "risk:low" --color 0E8A16 --description "Low risk: routine change" --force
	gh label create "risk:medium" --color FBCA04 --description "Medium risk: release steps or wider impact" --force
	gh label create "risk:high" --color D93F0B --description "High risk: pipeline, storage schema, secrets or SQL safety" --force
	gh label create "risk:critical" --color B60205 --description "Critical risk: needs the closest review" --force
	gh label create "dependencies" --color 0366D6 --description "Pull requests that update a dependency file" --force

# Everything CI runs on a pull request
all: quality integration smoke mutation-changed

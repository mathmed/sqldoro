import { Analysis } from './analysis.ts'
import { analyzeBuild } from './analyzers/build.ts'
import { analyzeContract } from './analyzers/contract.ts'
import { analyzeDependencyCruiser } from './analyzers/dependency-cruiser.ts'
import {
  COMPLEXITY_FAMILY,
  eslintAnalyzer,
  LINT_FAMILY,
  SECURITY_FAMILY,
} from './analyzers/eslint.ts'
import { analyzeHygiene } from './analyzers/hygiene.ts'
import { analyzeIntegration } from './analyzers/integration.ts'
import { analyzeJscpd } from './analyzers/jscpd.ts'
import { analyzeKnip } from './analyzers/knip.ts'
import { analyzeMutation } from './analyzers/mutation.ts'
import { analyzeNpmAudit } from './analyzers/npm-audit.ts'
import { analyzePackage } from './analyzers/package.ts'
import { analyzePrettier } from './analyzers/prettier.ts'
import { analyzeSmoke } from './analyzers/smoke.ts'
import { analyzeSuppressions } from './analyzers/suppressions.ts'
import { analyzeTsc } from './analyzers/tsc.ts'
import { analyzeVitest } from './analyzers/vitest.ts'
import type { Finding } from './finding.ts'
import type { Fragment } from './fragment.ts'

// CI jobs of .github/workflows/ci.yml: each one uploads its fragments as quality-fragment-<job> and
// is listed in the `needs` of the quality-report job.
export const Job = {
  Lint: 'lint',
  Quality: 'quality',
  Integration: 'integration',
  Architecture: 'architecture',
  Package: 'package',
  Smoke: 'smoke',
  Mutation: 'mutation',
} as const

export type Job = (typeof Job)[keyof typeof Job]

// The areas of the report's table, in their order.
export const Group = {
  Code: 'Code',
  Security: 'Security and dependencies',
  Behavior: 'Behavior',
  Architecture: 'Architecture',
} as const

export type Group = (typeof Group)[keyof typeof Group]

export interface Check {
  readonly analysis: Analysis
  readonly job: Job
  readonly label: string
  readonly analyze: (fragment: Fragment) => Finding
}

export interface Section {
  readonly group: Group
  readonly title: string
  // The local command that runs the checks of the section again.
  readonly reproduce: string
  readonly checks: readonly Check[]
}

const CODE: readonly Section[] = [
  {
    group: Group.Code,
    title: 'Lint and format (ESLint, Prettier, file hygiene)',
    reproduce: 'make lint hygiene',
    checks: [
      {
        analysis: Analysis.Eslint,
        job: Job.Lint,
        label: 'lint',
        analyze: eslintAnalyzer(LINT_FAMILY),
      },
      { analysis: Analysis.Prettier, job: Job.Lint, label: 'format', analyze: analyzePrettier },
      { analysis: Analysis.Hygiene, job: Job.Lint, label: 'hygiene', analyze: analyzeHygiene },
    ],
  },
  {
    group: Group.Code,
    title: 'Types (tsc)',
    reproduce: 'make typecheck',
    checks: [{ analysis: Analysis.Tsc, job: Job.Quality, label: 'tsc', analyze: analyzeTsc }],
  },
  {
    group: Group.Code,
    title: 'Dead code (knip)',
    reproduce: 'make dead-code',
    checks: [{ analysis: Analysis.Knip, job: Job.Quality, label: 'knip', analyze: analyzeKnip }],
  },
  {
    group: Group.Code,
    title: 'Complexity (ESLint)',
    reproduce: 'make lint',
    checks: [
      {
        analysis: Analysis.Eslint,
        job: Job.Lint,
        label: 'complexity',
        analyze: eslintAnalyzer(COMPLEXITY_FAMILY),
      },
    ],
  },
  {
    group: Group.Code,
    title: 'Duplication (jscpd)',
    reproduce: 'make duplication',
    checks: [{ analysis: Analysis.Jscpd, job: Job.Lint, label: 'jscpd', analyze: analyzeJscpd }],
  },
  {
    group: Group.Code,
    title: 'Suppressions (ratchet)',
    reproduce: 'make suppressions',
    checks: [
      {
        analysis: Analysis.Suppressions,
        job: Job.Lint,
        label: 'baseline',
        analyze: analyzeSuppressions,
      },
    ],
  },
]

const SECURITY: readonly Section[] = [
  {
    group: Group.Security,
    title: 'Security (ESLint, npm audit)',
    reproduce: 'make lint audit',
    checks: [
      {
        analysis: Analysis.Eslint,
        job: Job.Lint,
        label: 'ESLint',
        analyze: eslintAnalyzer(SECURITY_FAMILY),
      },
      {
        analysis: Analysis.NpmAudit,
        job: Job.Quality,
        label: 'npm audit',
        analyze: analyzeNpmAudit,
      },
    ],
  },
]

const BEHAVIOR: readonly Section[] = [
  {
    group: Group.Behavior,
    title: 'Tests and coverage (Vitest)',
    reproduce: 'make test',
    checks: [
      { analysis: Analysis.Vitest, job: Job.Quality, label: 'vitest', analyze: analyzeVitest },
    ],
  },
  {
    group: Group.Behavior,
    title: 'Integration tests (MySQL, PostgreSQL, SSH)',
    reproduce: 'make integration',
    checks: [
      {
        analysis: Analysis.Integration,
        job: Job.Integration,
        label: 'integration',
        analyze: analyzeIntegration,
      },
    ],
  },
  {
    group: Group.Behavior,
    title: 'Build and package (esbuild, Vite, vsce)',
    reproduce: 'make package',
    checks: [
      { analysis: Analysis.Build, job: Job.Package, label: 'build', analyze: analyzeBuild },
      { analysis: Analysis.Package, job: Job.Package, label: 'vsix', analyze: analyzePackage },
    ],
  },
  {
    group: Group.Behavior,
    title: 'Extension smoke (VS Code)',
    reproduce: 'make smoke',
    checks: [{ analysis: Analysis.Smoke, job: Job.Smoke, label: 'VS Code', analyze: analyzeSmoke }],
  },
  {
    group: Group.Behavior,
    title: 'Public contract (contributed commands, views and settings)',
    reproduce: 'make contract',
    checks: [
      { analysis: Analysis.Contract, job: Job.Lint, label: 'contract', analyze: analyzeContract },
    ],
  },
  {
    group: Group.Behavior,
    title: 'Mutation testing (Stryker)',
    reproduce: 'make mutation-changed',
    checks: [
      {
        analysis: Analysis.Mutation,
        job: Job.Mutation,
        label: 'stryker',
        analyze: analyzeMutation,
      },
    ],
  },
]

const ARCHITECTURE: readonly Section[] = [
  {
    group: Group.Architecture,
    title: 'Architecture (dependency-cruiser)',
    reproduce: 'make lint-arch',
    checks: [
      {
        analysis: Analysis.DependencyCruiser,
        job: Job.Architecture,
        label: 'contracts',
        analyze: analyzeDependencyCruiser,
      },
    ],
  },
]

export const SECTIONS: readonly Section[] = [...CODE, ...SECURITY, ...BEHAVIOR, ...ARCHITECTURE]

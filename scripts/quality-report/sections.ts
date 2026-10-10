import { Analysis } from './analysis.ts'
import { analyzeBuild } from './analyzers/build.ts'
import { analyzeDependencyCruiser } from './analyzers/dependency-cruiser.ts'
import {
  COMPLEXITY_FAMILY,
  eslintAnalyzer,
  LINT_FAMILY,
  SECURITY_FAMILY,
} from './analyzers/eslint.ts'
import { analyzeIntegration } from './analyzers/integration.ts'
import { analyzeKnip } from './analyzers/knip.ts'
import { analyzeMutation } from './analyzers/mutation.ts'
import { analyzeNpmAudit } from './analyzers/npm-audit.ts'
import { analyzePackage } from './analyzers/package.ts'
import { analyzePrettier } from './analyzers/prettier.ts'
import { analyzeSmoke } from './analyzers/smoke.ts'
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

export interface Check {
  readonly analysis: Analysis
  readonly job: Job
  readonly label: string
  readonly analyze: (fragment: Fragment) => Finding
}

export interface Section {
  readonly title: string
  readonly checks: readonly Check[]
}

export const SECTIONS: readonly Section[] = [
  {
    title: 'Lint and format (ESLint, Prettier)',
    checks: [
      {
        analysis: Analysis.Eslint,
        job: Job.Lint,
        label: 'lint',
        analyze: eslintAnalyzer(LINT_FAMILY),
      },
      { analysis: Analysis.Prettier, job: Job.Lint, label: 'format', analyze: analyzePrettier },
    ],
  },
  {
    title: 'Types (tsc)',
    checks: [{ analysis: Analysis.Tsc, job: Job.Quality, label: 'tsc', analyze: analyzeTsc }],
  },
  {
    title: 'Security (ESLint, npm audit)',
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
  {
    title: 'Dead code (knip)',
    checks: [{ analysis: Analysis.Knip, job: Job.Quality, label: 'knip', analyze: analyzeKnip }],
  },
  {
    title: 'Complexity (ESLint)',
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
    title: 'Tests and coverage (Vitest)',
    checks: [
      { analysis: Analysis.Vitest, job: Job.Quality, label: 'vitest', analyze: analyzeVitest },
    ],
  },
  {
    title: 'Integration tests (MySQL, PostgreSQL, SSH)',
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
    title: 'Architecture (dependency-cruiser)',
    checks: [
      {
        analysis: Analysis.DependencyCruiser,
        job: Job.Architecture,
        label: 'contracts',
        analyze: analyzeDependencyCruiser,
      },
    ],
  },
  {
    title: 'Build and package (esbuild, Vite, vsce)',
    checks: [
      { analysis: Analysis.Build, job: Job.Package, label: 'build', analyze: analyzeBuild },
      { analysis: Analysis.Package, job: Job.Package, label: 'vsix', analyze: analyzePackage },
    ],
  },
  {
    title: 'Extension smoke (VS Code)',
    checks: [{ analysis: Analysis.Smoke, job: Job.Smoke, label: 'VS Code', analyze: analyzeSmoke }],
  },
  {
    title: 'Mutation testing (Stryker)',
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

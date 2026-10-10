import comments from '@eslint-community/eslint-plugin-eslint-comments/configs'
import js from '@eslint/js'
import type { Linter } from 'eslint'
import prettier from 'eslint-config-prettier/flat'
import noUnsanitized from 'eslint-plugin-no-unsanitized'
import perfectionist from 'eslint-plugin-perfectionist'
import security from 'eslint-plugin-security'
import sonarjs from 'eslint-plugin-sonarjs'
import { defineConfig, globalIgnores } from 'eslint/config'
import tseslint from 'typescript-eslint'

const TYPESCRIPT_FILES = ['**/*.ts']
const PRODUCTION_FILES = ['src/**/*.ts', 'scripts/**/*.ts']
const TEST_FILES = ['**/*.test.ts', 'test/**/*.ts']

// Same thresholds as xenon A/A/A in py-awesome-template: no function above cyclomatic complexity
// 5. Never relax them to make a check pass: split the code instead (inline disables are rejected).
const COMPLEXITY_RULES: Linter.RulesRecord = {
  complexity: ['error', 5],
  'sonarjs/cognitive-complexity': ['error', 5],
  'max-depth': ['error', 2],
  'max-lines-per-function': ['error', { max: 30, skipBlankLines: true, skipComments: true }],
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-nested-callbacks': ['error', 3],
  'max-params': 'off',
  '@typescript-eslint/max-params': ['error', { max: 3 }],
}

// eslint-plugin-security ships its rules as warnings; every rule in this project is an error.
const SECURITY_RULES: Linter.RulesRecord = Object.fromEntries(
  Object.keys(security.configs.recommended.rules ?? {}).map((rule) => [rule, 'error']),
)

export default defineConfig([
  globalIgnores([
    'dist/',
    'coverage/',
    'reports/',
    '.stryker-tmp/',
    '.vscode-test/',
    'quality-fragments/',
  ]),
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
      reportUnusedInlineConfigs: 'error',
    },
  },
  {
    files: ['**/*.mjs'],
    extends: [js.configs.recommended],
  },
  {
    files: TYPESCRIPT_FILES,
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      tseslint.configs.stylisticTypeChecked,
      sonarjs.configs.recommended,
      security.configs.recommended,
      noUnsanitized.configs.recommended,
      comments.recommended,
    ],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { perfectionist },
    rules: {
      ...COMPLEXITY_RULES,
      ...SECURITY_RULES,
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-proto': 'error',
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/no-restricted-disable': [
        'error',
        ...Object.keys(COMPLEXITY_RULES),
      ],
      // Coverage and mutation pragmas hide untested code: each one needs a disable with a reason.
      'no-warning-comments': [
        'error',
        {
          terms: ['v8 ignore', 'c8 ignore', 'istanbul ignore', 'stryker disable'],
          location: 'anywhere',
        },
      ],
      '@typescript-eslint/naming-convention': [
        'error',
        { selector: 'default', format: ['camelCase'], leadingUnderscore: 'forbid' },
        { selector: 'import', format: ['camelCase', 'PascalCase'] },
        { selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
        { selector: 'typeLike', format: ['PascalCase'] },
        { selector: ['objectLiteralProperty', 'objectLiteralMethod'], format: null },
        {
          selector: ['variable', 'parameter', 'classProperty', 'typeProperty', 'accessor'],
          types: ['boolean'],
          format: ['PascalCase'],
          prefix: ['is', 'has', 'should', 'can'],
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/strict-boolean-expressions': [
        'error',
        { allowString: false, allowNumber: false, allowNullableObject: false },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: true, requireDefaultForNonUnion: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/consistent-type-exports': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/method-signature-style': ['error', 'property'],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/promise-function-async': 'error',
      '@typescript-eslint/require-array-sort-compare': 'error',
      '@typescript-eslint/default-param-last': 'error',
      '@typescript-eslint/no-shadow': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      eqeqeq: ['error', 'always'],
      'no-else-return': ['error', { allowElseIf: false }],
      'no-implicit-coercion': 'error',
      'no-lonely-if': 'error',
      'no-param-reassign': ['error', { props: true }],
      'no-unneeded-ternary': 'error',
      'no-useless-rename': 'error',
      'no-useless-return': 'error',
      'object-shorthand': 'error',
      'prefer-arrow-callback': 'error',
      'prefer-template': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'TSEnumDeclaration',
          message: 'Use an `as const` object and its value union instead of an enum.',
        },
        {
          selector: 'Property[key.name="shell"][value.value=true]',
          message: 'Never spawn through a shell: pass the command and an argument list.',
        },
      ],
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: 'node:child_process',
              importNames: ['exec', 'execSync'],
              message: 'They run through a shell: use execFile or spawn with an argument list.',
            },
          ],
          patterns: [
            {
              regex: '^(?!node:)(child_process|crypto|fs|path|url|util|os)(/.*)?$',
              message: 'Import Node.js built-ins with the `node:` prefix.',
            },
          ],
        },
      ],
      // Same grouping as isort: standard library, third party, first party, then relative imports.
      'perfectionist/sort-imports': [
        'error',
        {
          type: 'natural',
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index'], 'unknown'],
        },
      ],
      'perfectionist/sort-named-imports': ['error', { type: 'natural' }],
      'perfectionist/sort-exports': ['error', { type: 'natural' }],
      'perfectionist/sort-named-exports': ['error', { type: 'natural' }],
    },
  },
  {
    files: PRODUCTION_FILES,
    ignores: TEST_FILES,
    rules: {
      '@typescript-eslint/no-magic-numbers': [
        'error',
        {
          ignore: [-1, 0, 1],
          ignoreArrayIndexes: true,
          ignoreDefaultValues: true,
          ignoreNumericLiteralTypes: true,
          ignoreReadonlyClassProperties: true,
          ignoreTypeIndexes: true,
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts'],
    ignores: TEST_FILES,
    rules: {
      // The extension logs to a VS Code output channel; the scripts are command-line tools.
      'no-console': 'error',
    },
  },
  {
    // The only module of the CI scripts that touches the file system; its paths come from the
    // scripts' own constants and command-line arguments, never from untrusted input.
    files: ['scripts/shared/files.ts'],
    rules: { 'security/detect-non-literal-fs-filename': 'off' },
  },
  {
    files: TEST_FILES,
    rules: {
      'max-lines-per-function': 'off',
      'max-nested-callbacks': ['error', 4],
      // Tests create and read their own temporary files.
      'security/detect-non-literal-fs-filename': 'off',
    },
  },
  {
    files: TYPESCRIPT_FILES,
    extends: [prettier],
    rules: {
      curly: ['error', 'all'],
    },
  },
])

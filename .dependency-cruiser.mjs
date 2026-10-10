// Architecture contracts (make lint-arch). When one breaks, fix the import, not the contract:
// relaxing, removing or adding exceptions to a rule needs the owner's explicit approval.
//
//   src/core       engine interface, shared types and safety guards: pure TypeScript
//   src/drivers    one folder per database (mysql, postgres) implementing the core engine interface
//   src/extension  VS Code extension host: commands, views, secrets; wires drivers in factories/
//   src/webview    React result grid running in the browser sandbox of a webview

const DATABASE_CLIENTS = 'node_modules/(@types/)?(mysql|mysql2|mariadb|pg|pg-[^/]+|postgres|ssh2)/'
const UI_LIBRARIES = 'node_modules/(@types/)?(react|react-dom|preact|@vscode-elements/[^/]+)/'
const TEST_FILE = '\\.test\\.ts$'

/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: 'core-is-the-innermost-layer',
      comment:
        'The core declares the engine interface and the safety guards; drivers, the extension ' +
        'host and the webview depend on it, never the other way around.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: '^src/(drivers|extension|webview)/' },
    },
    {
      name: 'core-is-platform-agnostic',
      comment:
        'The core runs in the extension host and in the webview: it imports neither vscode nor ' +
        'Node.js built-ins. Platform services reach it through interfaces it declares.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'core-has-no-database-or-ui-libraries',
      comment: 'Database and SSH clients belong to the drivers, UI libraries to the webview.',
      severity: 'error',
      from: { path: '^src/core/' },
      to: { path: [DATABASE_CLIENTS, UI_LIBRARIES] },
    },
    {
      name: 'drivers-do-not-know-the-host-or-the-webview',
      comment: 'A driver only implements the core engine interface: no VS Code API, no UI.',
      severity: 'error',
      from: { path: '^src/drivers/' },
      to: { path: ['^src/(extension|webview)/', '^vscode$', UI_LIBRARIES] },
    },
    {
      name: 'drivers-are-independent',
      comment: 'What two drivers share lives in the core.',
      severity: 'error',
      from: { path: '^src/drivers/([^/]+)/' },
      to: { path: '^src/drivers/', pathNot: '^src/drivers/$1/' },
    },
    {
      name: 'only-the-composition-root-imports-drivers',
      comment:
        'The extension host talks to databases through the core engine interface; concrete ' +
        'drivers are instantiated only in src/extension/factories/.',
      severity: 'error',
      from: { path: '^src/extension/', pathNot: '^src/extension/factories/' },
      to: { path: '^src/drivers/' },
    },
    {
      name: 'extension-host-does-not-import-the-webview',
      comment:
        'The webview is a separate browser bundle loaded by URI; the host and the webview only ' +
        'share the core (types and the message protocol).',
      severity: 'error',
      from: { path: '^src/extension/' },
      to: { path: '^src/webview/' },
    },
    {
      name: 'webview-is-isolated-from-the-host',
      comment:
        'The webview runs in a browser sandbox: no extension host code, no drivers, no vscode ' +
        'module (it talks to the host through acquireVsCodeApi), no Node.js built-ins, no ' +
        'database clients.',
      severity: 'error',
      from: { path: '^src/webview/' },
      to: { path: ['^src/(extension|drivers)/', DATABASE_CLIENTS] },
    },
    {
      name: 'webview-runs-in-the-browser',
      comment: 'Node.js built-ins and the vscode module do not exist in a webview.',
      severity: 'error',
      from: { path: '^src/webview/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'no-circular',
      comment: 'Circular dependencies make the layers meaningless; extract what both sides need.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'product-does-not-import-tooling',
      comment: 'The extension never ships CI scripts or test support code.',
      severity: 'error',
      from: { path: '^src/', pathNot: TEST_FILE },
      to: { path: ['^(scripts|test)/', TEST_FILE] },
    },
    {
      name: 'tooling-does-not-import-the-product',
      comment: 'The CI scripts are independent from the extension they check.',
      severity: 'error',
      from: { path: '^scripts/' },
      to: { path: '^src/' },
    },
    {
      name: 'scripts-do-not-import-tests',
      severity: 'error',
      from: { path: '^scripts/', pathNot: TEST_FILE },
      to: { path: TEST_FILE },
    },
    {
      name: 'no-dev-dependencies-in-the-product',
      comment: 'Libraries the extension runs with are dependencies, not devDependencies.',
      severity: 'error',
      from: { path: '^src/', pathNot: TEST_FILE },
      to: { dependencyTypes: ['npm-dev'], dependencyTypesNot: ['type-only'] },
    },
    {
      name: 'no-undeclared-packages',
      comment: 'Every imported package is declared in package.json.',
      severity: 'error',
      from: {},
      to: { dependencyTypes: ['npm-no-pkg', 'npm-unknown'] },
    },
    {
      name: 'no-unresolvable-imports',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
  ],
  options: {
    doNotFollow: { path: ['node_modules'] },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    // Provided by VS Code at runtime; there is no package to resolve it to.
    builtInModules: { add: ['vscode'] },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'types', 'default'],
    },
    skipAnalysisNotInRules: true,
  },
}

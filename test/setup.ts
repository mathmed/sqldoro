import { vi } from 'vitest'

// The `vscode` module only exists inside the VS Code extension host.
vi.mock('vscode', async () => import('./vscode.ts'))

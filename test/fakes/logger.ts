// A Logger that records what it was told, in place of the sqldoro output channel.
import { type Mock, vi } from 'vitest'

import type { Logger } from '../../src/core/platform.ts'

export interface RecordingLogger extends Logger {
  readonly debug: Mock<(message: string) => void>
  readonly info: Mock<(message: string) => void>
  readonly warn: Mock<(message: string) => void>
  readonly error: Mock<(message: string) => void>
}

export function recordingLogger(): RecordingLogger {
  return {
    debug: vi.fn<(message: string) => void>(),
    info: vi.fn<(message: string) => void>(),
    warn: vi.fn<(message: string) => void>(),
    error: vi.fn<(message: string) => void>(),
  }
}

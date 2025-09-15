// @ts-nocheck
import { vi } from 'vitest';
import { Logger } from '../../src/utils/logger.js';
import { OpenCodeAdapter } from '../../src/opencode/opencode-adapter.js';
import { ArtifactManager } from '../../src/opencode/artifact-manager.js';
import { ProtocolHandler } from '../../src/agent/protocol-handler.js';
import { ACPClientConnection } from '../../src/types.js';
import * as opencode from '@opencode-ai/sdk';

export const createMockLogger = (): Logger => ({
  // @ts-ignore: Private member, not relevant for mock behavior
  logger: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

export const createMockClientConnection = (): ACPClientConnection => ({
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  requestPermission: vi.fn(),
  sessionUpdate: vi.fn(),
  createTerminal: vi.fn(),
  terminalOutput: vi.fn(),
  killTerminalCommand: vi.fn(),
  releaseTerminal: vi.fn(),
  waitForTerminalExit: vi.fn(),
});

export const createMockOpenCodeAdapter = (
  logger: Logger,
  clientConnection: ACPClientConnection,
): OpenCodeAdapter => ({
  // @ts-ignore: Private member, not relevant for mock behavior
  logger: logger,
  // @ts-ignore: Private member, not relevant for mock behavior
  clientConnection: clientConnection,
  // @ts-ignore: Private member, not relevant for mock behavior
  opencodeClient: {
    auth: {
      set: vi.fn(),
    },
    session: {
      shell: vi.fn(),
    },
  } as ReturnType<typeof opencode.createOpencodeClient>,
  authenticate: vi.fn(),
  executeStep: vi.fn(),
});

export const createMockArtifactManager = (
  opencodeAdapter: OpenCodeAdapter,
  logger: Logger,
): ArtifactManager => ({
  // @ts-ignore: Private member, not relevant for mock behavior
  opencodeAdapter: opencodeAdapter,
  // @ts-ignore: Private member, not relevant for mock behavior
  logger: logger,
  createArtifact: vi.fn(),
  getArtifact: vi.fn(),
});

export const createMockProtocolHandler = (logger: Logger): ProtocolHandler => ({
  // @ts-ignore: Private member, not relevant for mock behavior
  logger: logger,
  parseMessage: vi.fn(),
  validateMessage: vi.fn(),
});

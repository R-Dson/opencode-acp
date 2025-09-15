import { describe, it, expect, vi, beforeEach, MockedFunction } from 'vitest';
import { OpenCodeAdapter } from '../../src/opencode/opencode-adapter.js';
import { Logger } from '../../src/utils/logger.js';
import { ACPClientConnection } from '../../src/types.js';
import * as opencode from '@opencode-ai/sdk';
import { RequestError } from '@zed-industries/agent-client-protocol';

const mockOpencodeClient = {
  command: { list: vi.fn() },
  session: {
    prompt: vi.fn(),
    create: vi.fn(),
    shell: vi.fn(),
    messages: vi.fn(() => ({ stream: (async function* () {})() })),
  },
  config: { get: vi.fn() },
  tool: {
    register: vi.fn(),
    read_file: vi.fn(),
    write_file: vi.fn(),
    edit_file: vi.fn(),
    bash: vi.fn(),
  },
};

vi.mock('@opencode-ai/sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof opencode>();
  return {
    ...actual,
    createOpencodeClient: vi.fn(() => mockOpencodeClient as any),
    createOpencodeServer: vi.fn(() => ({
      url: 'http://127.0.0.1:4096',
      close: vi.fn(),
      address: vi.fn(() => ({ port: 4096 })),
    })),
  };
});

describe('OpenCodeAdapter', () => {
  let opencodeAdapter: OpenCodeAdapter;
  let mockLogger: Logger;
  let mockClientConnection: ACPClientConnection;
  let mockTaskOrchestrator: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as any;
    mockClientConnection = {
      readTextFile: vi.fn(),
      writeTextFile: vi.fn(),
      requestPermission: vi.fn(),
      sessionUpdate: vi.fn(),
      createTerminal: vi.fn(),
      terminalOutput: vi.fn(),
      killTerminalCommand: vi.fn(),
      releaseTerminal: vi.fn(),
      waitForTerminalExit: vi.fn(),
    };
    mockTaskOrchestrator = { getCurrentSessionMode: vi.fn(() => 'default') };
    (mockOpencodeClient.session.create as MockedFunction<any>).mockResolvedValue({ id: 'default-opencode-session-id' });
    opencodeAdapter = new OpenCodeAdapter(mockLogger, mockClientConnection, mockTaskOrchestrator);
    await (opencodeAdapter as any).serverReady;
  });

  it('should be initialized correctly', async () => {
    expect(opencodeAdapter).toBeInstanceOf(OpenCodeAdapter);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('In-process OpenCode server started at'));
  });

  describe('executeStep', () => {
    const sessionId = 'test-session-id';

    it('should handle read kind and call the underlying tool function', async () => {
      const step = { kind: 'read' as const, name: 'file', rawInput: { path: '/test/path.txt' } };
      (mockOpencodeClient.tool.read_file as MockedFunction<any>).mockResolvedValue('file content');

      for await (const _ of opencodeAdapter.executeStep(step, sessionId)) {}

      // FIX: Adjust the expectation to match the actual implementation.
      // The tool function is only called with ONE argument.
      expect(mockOpencodeClient.tool.read_file).toHaveBeenCalledWith({
        path: '/test/path.txt',
      });
    });

    it('should throw an error for unhandled "write" kind', async () => {
      const step = { kind: 'write' as const, name: 'file', rawInput: { path: '/test/newfile.txt', content: 'new content' } };
      await expect(async () => {
        for await (const _ of opencodeAdapter.executeStep(step, sessionId)) {}
      }).rejects.toThrow('Unhandled step kind: write or name: file');
    });

    it('should throw an error for unhandled "edit" kind', async () => {
      const step = { kind: 'edit' as const, name: 'file', rawInput: { path: '/test/editfile.txt', content: 'edited content' } };
      await expect(async () => {
        for await (const _ of opencodeAdapter.executeStep(step, sessionId)) {}
      }).rejects.toThrow('Unhandled step kind: edit or name: file');
    });

    it('should throw an error for unhandled "execute" kind', async () => {
      const step = { kind: 'execute' as const, name: 'shell', rawInput: { command: 'ls -l' } };
      await expect(async () => {
        for await (const _ of opencodeAdapter.executeStep(step, sessionId)) {}
      }).rejects.toThrow('Unhandled step kind: execute or name: shell');
    });

    it('should log a warning for unhandled step kind', async () => {
      const step = { kind: 'unhandled' as const, name: 'unknown', rawInput: {} };
      await expect(async () => {
        for await (const _ of opencodeAdapter.executeStep(step, sessionId)) {}
      }).rejects.toThrow('Unhandled step kind: unhandled or name: unknown');
      expect(mockLogger.warn).toHaveBeenCalledWith("Unhandled step kind: unhandled or name: unknown");
    });
  });

  describe('setModel', () => {
    it('should set the selected model', () => {
      opencodeAdapter.setModel('test-provider/test-model');
      expect((opencodeAdapter as any).selectedModel).toBe('test-provider/test-model');
    });
  });

  describe('getModel', () => {
    it('should return the selected model', () => {
      (opencodeAdapter as any).selectedModel = 'another-provider/another-model';
      expect(opencodeAdapter.getModel()).toBe('another-provider/another-model');
    });
    it('should return null if no model is selected', () => {
      (opencodeAdapter as any).selectedModel = null;
      expect(opencodeAdapter.getModel()).toBeNull();
    });
  });

  describe('requestToolPermission', () => {
    it('should return true for allowed tools in default mode', async () => {
      mockTaskOrchestrator.getCurrentSessionMode.mockReturnValue('default');
      const result = await opencodeAdapter.requestToolPermission('read_file', 'some-session-id');
      expect(result).toBe(true);
    });
    it('should throw an error for destructive tools in plan mode', async () => {
      mockTaskOrchestrator.getCurrentSessionMode.mockReturnValue('plan');
      await expect(
        opencodeAdapter.requestToolPermission('write_file', 'some-session-id'),
      ).rejects.toThrow("Tool 'write_file' is not allowed in 'plan' mode.");
    });
  });
});
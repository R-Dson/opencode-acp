import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ACPServer } from '../../src/agent/acp-server.js';
import { TaskOrchestrator } from '../../src/agent/task-orchestrator.js';
import { ProtocolHandler } from '../../src/agent/protocol-handler.js';
import { Logger } from '../../src/utils/logger.js';
import { ACPClientConnection } from '../../src/types.js';
import express, { Application } from 'express';
import { Request, Response } from 'express';
import {
  InitializeRequest,
  NewSessionRequest,
  PromptRequest,
  CancelNotification,
  SetSessionModeRequest,
  LoadSessionRequest,
} from '@zed-industries/agent-client-protocol';

// Mock the dependencies
vi.mock('../../src/agent/task-orchestrator');
vi.mock('../../src/agent/protocol-handler');
vi.mock('../../src/utils/logger');

describe('ACPServer', () => {
  let acpServer: ACPServer;
  let mockApp: any;
  let mockLogger: any;
  let mockProtocolHandler: any;
  let mockTaskOrchestrator: any;
  let mockClientConnection: ACPClientConnection;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create mocks
    mockApp = {
      use: vi.fn(),
      post: vi.fn(),
      listen: vi.fn(),
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    mockProtocolHandler = {
      parseMessage: vi.fn(),
      validateMessage: vi.fn(),
    };

    mockTaskOrchestrator = {
      handleInitialize: vi.fn(),
      handleNewSession: vi.fn(),
      handlePrompt: vi.fn(),
      handleArtifactCreate: vi.fn(),
      handleCancel: vi.fn(),
      handleLoadSession: vi.fn(),
      handleSetSessionMode: vi.fn(),
      setDependencies: vi.fn(),
    };

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

    // Mock constructors
    (Logger as any).mockImplementation(() => mockLogger);
    (ProtocolHandler as any).mockImplementation(() => mockProtocolHandler);
    (TaskOrchestrator as any).mockImplementation(() => mockTaskOrchestrator);

    acpServer = new ACPServer(mockApp, mockLogger);
    acpServer.setDependencies(mockProtocolHandler, mockTaskOrchestrator);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should initialize correctly', () => {
    expect(acpServer).toBeInstanceOf(ACPServer);
    expect(mockApp.use).toHaveBeenCalled();
    expect(mockApp.post).toHaveBeenCalledWith('/acp', expect.any(Function));
  });

  it('should start the server', () => {
    const port = 3000;
    acpServer.start(port);
    expect(mockApp.listen).toHaveBeenCalledWith(port, expect.any(Function));
  });

  // Test ACPClientConnection methods
  it('should implement readTextFile', async () => {
    const result = await acpServer.readTextFile({ sessionId: 'test', path: '/test/file.txt' });
    expect(result).toEqual({ content: '' });
    expect(mockLogger.info).toHaveBeenCalledWith('ACPClientConnection: readTextFile', {
      sessionId: 'test',
      path: '/test/file.txt',
    });
  });

  it('should implement writeTextFile', async () => {
    const result = await acpServer.writeTextFile({
      sessionId: 'test',
      path: '/test/file.txt',
      content: 'test content',
    });
    expect(result).toEqual({});
    expect(mockLogger.info).toHaveBeenCalledWith('ACPClientConnection: writeTextFile', {
      sessionId: 'test',
      path: '/test/file.txt',
      content: 'test content',
    });
  });

  it('should implement requestPermission', async () => {
    const request: any = { sessionId: 'test', permissions: ['fs/read'] };
    const result = await acpServer.requestPermission(request);
    expect(result).toEqual({ outcome: { outcome: 'selected', optionId: 'allow' } });
    expect(mockLogger.info).toHaveBeenCalledWith('ACPClientConnection: requestPermission', request);
  });

  it('should implement sessionUpdate', () => {
    const notification: any = {
      sessionId: 'test',
      update: {
        sessionUpdate: 'tool_call_update',
        toolCallId: 'tool-123',
        kind: 'shell',
        state: { status: 'running' },
      },
    };
    acpServer.sessionUpdate(notification);
    expect(mockLogger.info).toHaveBeenCalledWith(
      'ACPClientConnection: sessionUpdate',
      notification,
    );
  });

  it('should implement createTerminal', async () => {
    const result = await acpServer.createTerminal({ sessionId: 'test', command: 'bash' });
    expect(result).toEqual({ terminalId: 'mock-terminal-id' });
    expect(mockLogger.info).toHaveBeenCalledWith('ACPClientConnection: createTerminal', {
      sessionId: 'test',
      command: 'bash',
    });
  });

  it('should implement terminalOutput', async () => {
    const result = await acpServer.terminalOutput({ sessionId: 'test', terminalId: 'term-123' });
    expect(result).toEqual({ output: '', truncated: false });
    expect(mockLogger.info).toHaveBeenCalledWith('ACPClientConnection: terminalOutput', {
      sessionId: 'test',
      terminalId: 'term-123',
    });
  });

  it('should implement killTerminalCommand', async () => {
    const result = await acpServer.killTerminalCommand({
      sessionId: 'test',
      terminalId: 'term-123',
    });
    expect(result).toEqual({});
    expect(mockLogger.info).toHaveBeenCalledWith('ACPClientConnection: killTerminalCommand', {
      sessionId: 'test',
      terminalId: 'term-123',
    });
  });

  it('should implement releaseTerminal', async () => {
    const result = await acpServer.releaseTerminal({ sessionId: 'test', terminalId: 'term-123' });
    expect(result).toEqual({});
    expect(mockLogger.info).toHaveBeenCalledWith('ACPClientConnection: releaseTerminal', {
      sessionId: 'test',
      terminalId: 'term-123',
    });
  });

  it('should implement waitForTerminalExit', async () => {
    const result = await acpServer.waitForTerminalExit({
      sessionId: 'test',
      terminalId: 'term-123',
    });
    expect(result).toEqual({ exitCode: 0 });
    expect(mockLogger.info).toHaveBeenCalledWith('ACPClientConnection: waitForTerminalExit', {
      sessionId: 'test',
      terminalId: 'term-123',
    });
  });
});

import { Readable, Writable } from 'node:stream';
import { ACPClientConnection } from '../types.js';
import {
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionNotification,
  CreateTerminalRequest,
  CreateTerminalResponse,
  TerminalOutputRequest,
  TerminalOutputResponse,
  KillTerminalCommandRequest,
  KillTerminalResponse,
  ReleaseTerminalRequest,
  ReleaseTerminalResponse,
  WaitForTerminalExitRequest,
  WaitForTerminalExitResponse,
  terminalExitStatusSchema,
} from '@zed-industries/agent-client-protocol';
import { AgentSideConnection, Agent } from '@zed-industries/agent-client-protocol';
import { Logger } from '../utils/logger.js';
import { ProtocolHandler } from './protocol-handler.js';
import { TaskOrchestrator } from './task-orchestrator.js';
import { OpenCodeAdapter } from '../opencode/opencode-adapter.js';
import { ArtifactManager } from '../opencode/artifact-manager.js';
import { ACPAgent } from './acp-agent.js';
import { createPreprocessedInputStream } from '../utils/streams.js';

export class StdioACPClientConnection implements ACPClientConnection {
  private agentSideConnection: AgentSideConnection;
  private logger: Logger;
  private protocolHandler: ProtocolHandler;
  private opencodeAdapter: OpenCodeAdapter;
  private artifactManager: ArtifactManager;
  private taskOrchestrator: TaskOrchestrator;
  private acpAgent: ACPAgent;

  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.info('StdioACPClientConnection: constructor called');
    this.protocolHandler = new ProtocolHandler(logger);

    // Create components with placeholders, to be updated later
    // OpenCodeAdapter needs to be initialized with clientConnection and taskOrchestrator
    // but those are not available until later in the setup process.
    // We will initialize them with `null` or a mock and then set them correctly later.
    this.opencodeAdapter = new OpenCodeAdapter(logger, null as any, null as any); // Temporarily pass nulls
    this.artifactManager = new ArtifactManager(this.opencodeAdapter, logger);
    this.taskOrchestrator = new TaskOrchestrator(
      this.opencodeAdapter,
      this.artifactManager,
      this.protocolHandler,
      this,
      logger,
    );
    this.acpAgent = new ACPAgent(this.taskOrchestrator, logger);

    // Now set the correct taskOrchestrator and clientConnection in opencodeAdapter
    (this.opencodeAdapter as any).clientConnection = this;
    (this.opencodeAdapter as any).taskOrchestrator = this.taskOrchestrator;

    this.logger.info('StdioACPClientConnection: components created');

    // Create preprocessed streams
    const outputStream = Writable.toWeb(process.stdout) as WritableStream;
    const preprocessedInputStream = createPreprocessedInputStream(
      this.protocolHandler,
      this.logger,
    );

    this.logger.info('StdioACPClientConnection: streams created');

    // Create AgentSideConnection, passing a factory that returns our ACPAgent and the streams
    this.agentSideConnection = new AgentSideConnection(
      (conn) => {
        this.logger.info('StdioACPClientConnection: agent factory called');
        // Update OpenCodeAdapter with the actual AgentSideConnection
        this.opencodeAdapter.setClientConnection(conn as any); // Cast to any to bypass strict type checking for now
        return this.acpAgent;
      },
      outputStream, // output stream (WritableStream)
      preprocessedInputStream, // input stream (ReadableStream)
    );

    this.logger.info('StdioACPClientConnection: AgentSideConnection created');
  }
  terminalOutput(request: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    throw new Error('Method not implemented.');
  }
  killTerminalCommand(request: KillTerminalCommandRequest): Promise<KillTerminalResponse> {
    throw new Error('Method not implemented.');
  }
  releaseTerminal(request: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> {
    throw new Error('Method not implemented.');
  }
  waitForTerminalExit(request: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse> {
    throw new Error('Method not implemented.');
  }

  // ACPClientConnection implementation
  async readTextFile(request: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    this.logger.info('StdioACPClientConnection: readTextFile', request);
    return this.agentSideConnection.readTextFile(request);
  }

  async writeTextFile(request: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    this.logger.info('StdioACPClientConnection: writeTextFile', request);
    return this.agentSideConnection.writeTextFile(request);
  }

  async requestPermission(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    this.logger.info('StdioACPClientConnection: requestPermission', request);
    return this.agentSideConnection.requestPermission(request);
  }

  sessionUpdate(notification: SessionNotification): void {
    this.logger.info('StdioACPClientConnection: sessionUpdate', notification);
    this.agentSideConnection.sessionUpdate(notification);
  }

  async createTerminal(request: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    this.logger.info('StdioACPClientConnection: createTerminal', request);
    // The AgentSideConnection's createTerminal returns a TerminalHandle, not a CreateTerminalResponse.
    // We need to extract the terminalId from the TerminalHandle.
    const terminalHandle = await this.agentSideConnection.createTerminal(request);
    return { terminalId: terminalHandle.id };
  }
}

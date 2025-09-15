import express, { Application, Request, Response, NextFunction } from 'express';
import { Logger } from '../utils/logger.js';
import { ProtocolHandler } from './protocol-handler.js';
import { TaskOrchestrator } from './task-orchestrator.js';
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
  InitializeRequest,
  NewSessionRequest, // Import directly
  PromptRequest, // Import directly
  CancelNotification, // Import directly
  LoadSessionRequest, // Import directly
  SetSessionModeRequest, // Import directly
} from '@zed-industries/agent-client-protocol';
import {
  ArtifactCreateRequest, // From types.ts
  SetModelRequest, // From types.ts
} from '../types.js';

import type { JsonRpcMessage, JsonRpcRequest, JsonRpcNotification } from './protocol-handler.js';


export class ACPServer implements ACPClientConnection {
  private app: Application;
  private protocolHandler!: ProtocolHandler; // Marked with ! as it will be set by setDependencies
  private taskOrchestrator!: TaskOrchestrator; // Marked with !
  private logger: Logger;

  constructor(app: Application, logger: Logger) {
    this.app = app;
    this.logger = logger;
    this.setupRoutes();
  }

  setDependencies(protocolHandler: ProtocolHandler, taskOrchestrator: TaskOrchestrator) {
    this.protocolHandler = protocolHandler;
    this.taskOrchestrator = taskOrchestrator;
    // Also update the task orchestrator with the client connection (this)
    this.taskOrchestrator.setDependencies(
      (this.taskOrchestrator as any).opencodeAdapter, // This 'any' needs to be addressed later
      (this.taskOrchestrator as any).artifactManager, // This 'any' needs to be addressed later
      protocolHandler,
      this,
    );
  }

  private setupRoutes() {
    this.app.use(express.json()); // Use express.json() middleware for all requests
    this.app.post('/acp', async (req: Request, res: Response) => {
      this.logger.info('Received ACP request', req.body);
      try {
        const message = this.protocolHandler.parseMessage(req.body);
        if (!this.protocolHandler.validateMessage(message)) {
          this.logger.warn('Invalid ACP message received', message);
          return res.status(400).send('Invalid ACP message');
        }

        // Narrow down the type of message
        if ('method' in message) { // It's a JsonRpcRequest or JsonRpcNotification
          const requestMessage = message as JsonRpcRequest | JsonRpcNotification; // Cast to union of Request/Notification
          if (requestMessage.method === 'initialize') {
            const response = await this.taskOrchestrator.handleInitialize(requestMessage.params as unknown as InitializeRequest); // Cast params
            // Check if it's a request (has an id) before sending a response
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.json({ jsonrpc: '2.0', id: requestMessage.id, result: response });
            } else {
              res.status(200).send('Notification received and handled'); // For notifications
            }
          } else if (requestMessage.method === 'session/new') {
            const response = await this.taskOrchestrator.handleNewSession(requestMessage.params as unknown as NewSessionRequest); // Cast params
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.json({ jsonrpc: '2.0', id: requestMessage.id, result: response });
            } else {
              res.status(200).send('Notification received and handled');
            }
          } else if (requestMessage.method === 'session/prompt') {
            const response = await this.taskOrchestrator.handlePrompt(requestMessage.params as unknown as PromptRequest); // Cast params
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.json({ jsonrpc: '2.0', id: requestMessage.id, result: response });
            } else {
              res.status(200).send('Notification received and handled');
            }
          } else if (requestMessage.method === 'artifact.create') {
            const response = await this.taskOrchestrator.handleArtifactCreate(requestMessage.params as unknown as ArtifactCreateRequest); // Cast params
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.json({ jsonrpc: '2.0', id: requestMessage.id, result: response });
            } else {
              res.status(200).send('Notification received and handled');
            }
          } else if (requestMessage.method === 'session/cancel') {
            await this.taskOrchestrator.handleCancel(requestMessage.params as unknown as CancelNotification); // Cast params
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.json({ jsonrpc: '2.0', id: requestMessage.id, result: {} });
            } else {
              res.status(200).send('Notification received and handled');
            }
          } else if (requestMessage.method === 'session/load') {
            const response = await this.taskOrchestrator.handleLoadSession(requestMessage.params as unknown as LoadSessionRequest); // Cast params
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.json({ jsonrpc: '2.0', id: requestMessage.id, result: response });
            } else {
              res.status(200).send('Notification received and handled');
            }
          } else if (requestMessage.method === 'session/set_mode') {
            const response = await this.taskOrchestrator.handleSetSessionMode(requestMessage.params as unknown as SetSessionModeRequest); // Cast params
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.json({ jsonrpc: '2.0', id: requestMessage.id, result: response });
            } else {
              res.status(200).send('Notification received and handled');
            }
          } else if (requestMessage.method === 'agent/set_model') {
            const response = await this.taskOrchestrator.handleSetModel(requestMessage.params as unknown as SetModelRequest); // Cast params
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.json({ jsonrpc: '2.0', id: requestMessage.id, result: response });
            } else {
              res.status(200).send('Notification received and handled');
            }
          } else {
            // Unhandled method, but still a valid JSON-RPC message
            if ('id' in requestMessage && requestMessage.id !== undefined) {
              res.status(405).json({ jsonrpc: '2.0', id: requestMessage.id, error: { code: -32601, message: `Method not found: ${requestMessage.method}` } });
            } else {
              res.status(200).send('Notification for unhandled method received');
            }
          }
        } else { // It's a JsonRpcResponse
            // Responses are not handled by the server in this context, they are usually sent from server to client.
            // Log it or ignore it, depending on the desired behavior.
            this.logger.warn('Received unexpected JSON-RPC response message on /acp endpoint.', message);
            res.status(400).send('Received unexpected JSON-RPC response message');
        }
      } catch (error: unknown) {
        this.logger.error(`Error handling ACP request: ${error instanceof Error ? error.message : String(error)}`, error);
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: error instanceof Error ? error.message : String(error) } });
      }
    });
  }

  start(port: number) {
    this.app.listen(port, () => {
      this.logger.info(`ACP Server started on port ${port}`);
    });
  }

  // ACPClientConnection implementation (placeholders for now)
  async readTextFile(request: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    this.logger.info('ACPClientConnection: readTextFile', request);
    // Implement actual communication with the client
    return { content: '' };
  }

  async writeTextFile(request: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    this.logger.info('ACPClientConnection: writeTextFile', request);
    // Implement actual communication with the client
    return {};
  }

  async requestPermission(request: RequestPermissionRequest): Promise<RequestPermissionResponse> {
    this.logger.info('ACPClientConnection: requestPermission', request);
    // Implement actual communication with the client
    return { outcome: { outcome: 'selected', optionId: 'allow' } };
  }

  sessionUpdate(notification: SessionNotification): void {
    this.logger.info('ACPClientConnection: sessionUpdate', notification);
    // Implement actual communication with the client
  }

  async createTerminal(request: CreateTerminalRequest): Promise<CreateTerminalResponse> {
    this.logger.info('ACPClientConnection: createTerminal', request);
    // Implement actual communication with the client
    return { terminalId: 'mock-terminal-id' };
  }

  async terminalOutput(request: TerminalOutputRequest): Promise<TerminalOutputResponse> {
    this.logger.info('ACPClientConnection: terminalOutput', request);
    // Implement actual communication with the client
    return { output: '', truncated: false };
  }

  async killTerminalCommand(request: KillTerminalCommandRequest): Promise<KillTerminalResponse> {
    this.logger.info('ACPClientConnection: killTerminalCommand', request);
    // Implement actual communication with the client
    return {};
  }

  async releaseTerminal(request: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse> {
    this.logger.info('ACPClientConnection: releaseTerminal', request);
    // Implement actual communication with the client
    return {};
  }

  async waitForTerminalExit(
    request: WaitForTerminalExitRequest,
  ): Promise<WaitForTerminalExitResponse> {
    this.logger.info('ACPClientConnection: waitForTerminalExit', request);
    // Implement actual communication with the client
    return { exitCode: 0 };
  }
}

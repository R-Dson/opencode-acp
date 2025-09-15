import { Logger } from '../utils/logger.js';
import { OpenCodeAdapter } from '../opencode/opencode-adapter.js';
import { ArtifactManager } from '../opencode/artifact-manager.js';
import { ProtocolHandler } from './protocol-handler.js';
import {
  InitializeRequest,
  NewSessionRequest,
  NewSessionResponse,
  PromptRequest,
  PromptResponse,
  CancelNotification,
  LoadSessionRequest,
  LoadSessionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
  RequestError,
  SessionNotification,
  AuthenticateRequest,
  ContentBlock,
} from '@zed-industries/agent-client-protocol';
import {
  SetModelRequest,
  SetModelResponse,
  ArtifactCreateRequest,
  ArtifactCreateResponse,
  AgentStartNotification,
  TaskCreateNotification,
} from '../types.js';
import { McpServer, InitializeResponse } from '../models/acp.js';
import { ACPClientConnection } from '../types.js';
import { isOpenCodeAuthenticated, getOpenCodeAuthMethods } from '../utils/auth-utils.js';

export class TaskOrchestrator {
  private opencodeAdapter: OpenCodeAdapter;
  private artifactManager: ArtifactManager;
  private protocolHandler: ProtocolHandler;
  private clientConnection: ACPClientConnection;
  private logger: Logger;
  private currentSessionId: string | null = null;
  // The 'sessions' map stores information about active ACP sessions.
  // 'currentMode' here refers to the ACP session mode, which aligns with the
  // external agent-client-protocol's concept of modes.
  private sessions: Map<string, { cancelled: boolean; currentMode: string; cwd?: string }>;

  constructor(
    opencodeAdapter: OpenCodeAdapter,
    artifactManager: ArtifactManager,
    protocolHandler: ProtocolHandler,
    clientConnection: ACPClientConnection,
    logger: Logger,
  ) {
    this.opencodeAdapter = opencodeAdapter;
    this.artifactManager = artifactManager;
    this.protocolHandler = protocolHandler;
    this.clientConnection = clientConnection;
    this.logger = logger;
    this.sessions = new Map();
    this.logger.info('TaskOrchestrator initialized.');
  }

  setDependencies(
    opencodeAdapter: OpenCodeAdapter,
    artifactManager: ArtifactManager,
    protocolHandler: ProtocolHandler,
    clientConnection: ACPClientConnection,
  ) {
    this.opencodeAdapter = opencodeAdapter;
    this.artifactManager = artifactManager;
    this.protocolHandler = protocolHandler;
    this.clientConnection = clientConnection;
  }

  async handleInitialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.logger.info('Handling initialize event', params);

    const agentCapabilities = {
      loadSession: true, // Enable loadSession capability
      mcpCapabilities: { stdio: true },
      promptCapabilities: { audio: false, embeddedContext: false, image: false },
    };

    const response: InitializeResponse = {
      protocolVersion: 1,
      agentCapabilities: agentCapabilities,
      authMethods: getOpenCodeAuthMethods(),
    };

    this.logger.info('Sending initialize response', response);
    return response;
  }

  async handleNewSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    this.logger.info('Handling new session event', params);

    this.logger.info('Checking OpenCode authentication status...');
    const isAuthenticated = isOpenCodeAuthenticated();
    this.logger.info(`OpenCode authentication check result: ${isAuthenticated}`);

    if (!isAuthenticated) {
      this.logger.warn('OpenCode authentication required but not found');
      const authMethods = getOpenCodeAuthMethods();
      this.logger.info(`Available auth methods: ${JSON.stringify(authMethods)}`);
      throw new RequestError(-32002, 'Authentication required', {
        kind: 'auth_required',
        authMethods: authMethods,
      });
    }

    const sessionId = `session-${Date.now()}`;
    this.currentSessionId = sessionId;
    const initialCwd = params.cwd || undefined; // ACP NewSessionRequest might include cwd

    this.sessions.set(sessionId, { cancelled: false, currentMode: 'default', cwd: initialCwd });

    await this._connectMcpServers(params.mcpServers);

    return {
      sessionId: sessionId,
      modes: {
        currentModeId: 'default',
        availableModes: [
          {
            id: 'default',
            name: 'Default',
            description: 'Default mode with full capabilities.',
          },
          {
            id: 'plan',
            name: 'Plan Mode',
            description: 'Agent can analyze but not modify files or execute commands.',
          },
        ],
      },
    };
  }

  async handlePrompt(params: PromptRequest): Promise<PromptResponse> {
    this.logger.info('Handling session/prompt event', params);
    if (!this.currentSessionId || this.currentSessionId !== params.sessionId) {
      this.logger.info(`Session ${params.sessionId} not found, creating implicitly`);
      this.currentSessionId = params.sessionId;
      this.sessions.set(params.sessionId, {
        cancelled: false,
        currentMode: 'default',
        cwd: undefined,
      }); // Implicitly created sessions start with no specific cwd
    }

    // Create a new array to hold all prompt parts, including processed resources
    const processedPromptParts: Array<ContentBlock> = [];

    for (const contentBlock of params.prompt) {
      switch (contentBlock.type) {
        case 'text':
          this.logger.info(`Processing text: ${contentBlock.text}`);
          processedPromptParts.push({ type: 'text', text: contentBlock.text });
          break;
        case 'resource_link':
          this.logger.info(`Processing resource link: ${contentBlock.uri}`);
          try {
            // For resource_link, we need to read the file content
            let fileContentText = '';
            const fileContentIterator = this.opencodeAdapter.executeStep(
              {
                kind: 'read',
                name: 'file',
                rawInput: { path: contentBlock.uri },
              },
              params.sessionId,
            );
            for await (const chunk of fileContentIterator) {
              if (
                chunk &&
                'sessionUpdate' in chunk &&
                chunk.sessionUpdate === 'agent_message_chunk' &&
                chunk.content &&
                'text' in chunk.content
              ) {
                fileContentText += chunk.content.text;
              }
            }
            this.logger.info(`Resource content fetched for ${contentBlock.uri}`);
            processedPromptParts.push({
              type: 'text',
              text: `File: ${contentBlock.uri}\n\`\`\`\n${fileContentText}\n\`\`\``,
            });
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.logger.error(
              `Error fetching resource content for ${contentBlock.uri}: ${errorMessage}`,
              error,
            );
            processedPromptParts.push({
              type: 'text',
              text: `Error: Could not read file ${contentBlock.uri}: ${errorMessage}`,
            });
          }
          break;
        case 'resource':
          this.logger.info(`Processing embedded resource: ${contentBlock.resource.uri}`);
          // Embedded resources already have their content
          if ('text' in contentBlock.resource) {
            processedPromptParts.push({
              type: 'text',
              text: `Embedded Resource: ${contentBlock.resource.uri}\n\`\`\`\n${contentBlock.resource.text}\n\`\`\``,
            });
          }
          break;
        default:
          this.logger.warn(`Unhandled content block type: ${contentBlock.type}`);
          processedPromptParts.push({
            type: 'text',
            text: `Unhandled content block type: ${contentBlock.type}`,
          });
          break;
      }
    }

    if (processedPromptParts.length > 0) {
      try {
        const promptStep = {
          kind: 'prompt',
          name: 'user_message',
          rawInput: {
            parts: processedPromptParts, // Pass the array of parts
          },
        };

        const resultIterator = await this.opencodeAdapter.executeStep(promptStep, params.sessionId);

        for await (const chunk of resultIterator) {
          if ('stopReason' in chunk) {
            // This is the final chunk with the stop reason
            this.logger.info('Prompt execution completed');
            return { stopReason: chunk.stopReason };
          } else {
            this.clientConnection.sessionUpdate({
              sessionId: params.sessionId,
              update: chunk, // chunk is already the SessionNotification['update'] object
            });
          }
        }
        // Should not reach here if stopReason is always yielded.
        this.logger.warn('Prompt execution completed without explicit stopReason.');
        return { stopReason: 'end_turn' };
      } catch (error: any) {
        this.logger.error(`Error executing prompt: ${error instanceof Error ? error.message : String(error)}`, error);
        throw new RequestError(-32000, `Error executing prompt: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      return { stopReason: 'end_turn' };
    }
  }

  async handleCancel(params: CancelNotification): Promise<void> {
    this.logger.info('Handling session/cancel event', params);
    const session = this.sessions.get(params.sessionId);
    if (session) {
      session.cancelled = true;
      this.logger.info(`Session ${params.sessionId} marked as cancelled.`);
      try {
        this.clientConnection.sessionUpdate({
          sessionId: params.sessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              type: 'text',
              text: 'Session has been cancelled by the user.',
            },
          },
        });
        this.logger.info(`Cancellation notification sent for session ${params.sessionId}`);
      } catch (error: unknown) {
        this.logger.error(`Error sending cancellation notification: ${error instanceof Error ? error.message : String(error)}`, error);
      }
    } else {
      this.logger.warn(`Attempted to cancel non-existent session: ${params.sessionId}`);
    }
  }

  async handleLoadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    this.logger.info('Handling session/load event', params);

    const { sessionId, cwd, mcpServers } = params;

    // Check if the session exists in OpenCode
    // Assuming opencodeClient.session.get can retrieve an existing session by ID
    // and opencodeClient.session.messages can retrieve its messages.
    try {
      // Verify session existence (optional, but good practice)
      const opencodeSession = await this.opencodeAdapter
        .getOpencodeClient()
        .session.get({ path: { id: sessionId } });
      if (!opencodeSession) {
        throw new RequestError(-32001, `Session not found in OpenCode: ${sessionId}`);
      }

      this.currentSessionId = sessionId;
      // The OpenCode client does not expose a direct method to set the CWD for a session.
      // We store it in the ACP session state, assuming it will either be implicitly handled
      // by the OpenCode server based on launch parameters or passed to individual tool calls.
      this.sessions.set(sessionId, {
        cancelled: false,
        currentMode: 'default',
        cwd: cwd || undefined,
      });

      this.logger.info(`Session ${sessionId} loaded. Replaying conversation history.`);

      // Replay conversation history
      const messages = await this.opencodeAdapter
        .getOpencodeClient()
        .session.messages({ path: { id: sessionId } });

      for (const message of messages) {
        // Determine if it's a user or agent message and send appropriate update
        const sessionUpdateType =
          message.info.role === 'user' ? 'user_message_chunk' : 'agent_message_chunk';

        for (const part of message.parts) {
          if (part.type === 'text') {
            const contentBlock: ContentBlock = { type: 'text', text: part.text };
            this.clientConnection.sessionUpdate({
              sessionId: sessionId,
              update: {
                sessionUpdate: sessionUpdateType,
                content: contentBlock,
              },
            });
          } else {
            this.logger.warn(
              `Skipping non-text part of type '${part.type}' during session replay for session ${sessionId}. Full support for all content types is not yet implemented.`,
            );
            this.clientConnection.sessionUpdate({
              sessionId: sessionId,
              update: {
                sessionUpdate: sessionUpdateType,
                content: { type: 'text', text: `[Skipped non-text content of type: ${part.type}]` },
              },
            });
          }
        }
      }

      this.logger.info(`Conversation history replayed for session ${sessionId}.`);

      await this._connectMcpServers(mcpServers);
      return {
        modes: {
          currentModeId: 'default',
          availableModes: [{ id: 'default', name: 'Default', description: 'Default mode.' }],
        },
      } as LoadSessionResponse;
    } catch (error: unknown) {
      this.logger.error(`Error loading session ${sessionId}: ${error instanceof Error ? error.message : String(error)}`, error);
      throw new RequestError(-32001, `Error loading session: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async handleSetSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    // This method handles requests from the ACP client to change the session mode.
    // The 'modeId' corresponds to the modes defined in the agent-client-protocol
    // and advertised in the newSession response.
    // It allows the client to switch the operational context for the agent.
    this.logger.info('Handling session/set_mode event', params);
    const session = this.sessions.get(params.sessionId);
    if (session) {
      const availableModeIds = ['default', 'plan'];
      if (!availableModeIds.includes(params.modeId)) {
        throw new RequestError(-32602, `Invalid modeId: ${params.modeId}`);
      }
      session.currentMode = params.modeId;
      this.logger.info(`Session ${params.sessionId} mode set to ${params.modeId}`);
      return {};
    } else {
      throw new RequestError(-32001, `Session not found: ${params.sessionId}`);
    }
  }

  public getCurrentSessionMode(sessionId: string): string {
    const session = this.sessions.get(sessionId);
    return session?.currentMode || 'default';
  }

  async handleSetModel(params: SetModelRequest): Promise<SetModelResponse> {
    this.logger.info('Handling agent/set_model event', params);

    if (typeof params.model !== 'string') {
      throw new RequestError(-32602, 'Invalid params: model is required and must be a string');
    }

    const modelParts = params.model.split('/');
    if (modelParts.length !== 2 || !modelParts[0] || !modelParts[1]) {
      throw new RequestError(-32602, 'Invalid model format: expected "provider/model"');
    }

    this.opencodeAdapter.setModel(params.model);

    this.logger.info(`Model set to: ${params.model}`);

    return { success: true, model: params.model };
  }

  async handleArtifactCreate(params: ArtifactCreateRequest): Promise<ArtifactCreateResponse> {
    this.logger.info('Handling artifact.create event', params);
    if (!this.currentSessionId || this.currentSessionId !== params.sessionId) {
      this.logger.info(
        `Session ${params.sessionId} not found for artifact.create, creating implicitly`,
      );
      this.currentSessionId = params.sessionId;
      this.sessions.set(params.sessionId, { cancelled: false, currentMode: 'default' });
    }

    try {
      const result = await this.artifactManager.createArtifact(params.artifact);
      this.logger.info('Artifact created successfully', result);
      return { success: true, artifact: result };
    } catch (error: unknown) {
      this.logger.error(`Error creating artifact: ${error instanceof Error ? error.message : String(error)}`, error);
      throw error;
    }
  }

  async handleAuthenticate(params: AuthenticateRequest): Promise<void> {
    this.logger.info('Handling authenticate event', params);

    this.logger.info(`Authentication requested for method: ${params.methodId}`);

    throw new RequestError(
      -32003,
      'Please authenticate using the command line: opencode auth login',
    );
  }

  handleAgentStart(payload: AgentStartNotification) {
    this.logger.info('Handling agent.start event', payload);
  }

  handleTaskCreate(payload: TaskCreateNotification) {
    this.logger.info('Handling task.create event', payload);
  }

  private async _connectMcpServers(mcpServers: McpServer[] | undefined) {
    if (mcpServers && Array.isArray(mcpServers)) {
      for (const server of mcpServers) {
        if ('command' in server && 'args' in server && server.command !== undefined) {
          // Stdio
          this.logger.info(
            `Connecting to MCP server (stdio): ${server.command} ${server.args?.join(' ')}`,
          );
          await this.opencodeAdapter.connectMcpServer(server.command, 'stdio', server.args);
        } else if ('type' in server && server.type === 'http') {
          // Http
          this.logger.warn(
            `MCP server of type 'http' is not yet fully implemented. Skipping connection for ${server.url}.`,
          );
        } else if ('type' in server && server.type === 'sse') {
          // Sse
          this.logger.warn(
            `MCP server of type 'sse' is not yet fully implemented. Skipping connection for ${server.name}.`,
          );
        } else {
          this.logger.warn(
            `Unsupported MCP server type: ${(server as any).type || 'unknown'}. Only 'stdio' is currently fully supported.`,
          );
        }
      }
    }
  }
}

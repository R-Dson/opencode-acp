import { Logger } from '../utils/logger.js';
import { ACPClientConnection, SessionData } from '../types.js';
import { createOpencodeClient, Command } from '@opencode-ai/sdk';
import { createOpencodeServer } from '@opencode-ai/sdk/server';
import {
  AvailableCommand,
  SessionNotification,
  RequestError,
  ToolCallUpdate,
  ToolCallContent,
  ToolKind,
  ToolCallStatus,
  ToolCallLocation,
  ContentBlock,
} from '@zed-industries/agent-client-protocol';
import { registerTools as registerToolsFn } from './tools.js';
import { mapToolCodeToAcpToolCall, mapToolOutputToAcpContent } from './acp-mappers.js';
import { TaskOrchestrator } from '../agent/task-orchestrator.js';
import { AVAILABLE_SLASH_COMMANDS } from '../../docs/slash-commands.js';


export interface ReadStepInput {
  path: string;
}

export interface PromptStepInput {
  parts: ContentBlock[];
}

export type Step =
  | { kind: 'read'; name: 'file'; rawInput: ReadStepInput }
  | { kind: 'prompt'; name: 'user_message'; rawInput: PromptStepInput }
  | { kind: string; name: string; rawInput: Record<string, unknown> }; // Generic fallback for other step types


export class OpenCodeAdapter {
  private logger: Logger;
  private clientConnection: ACPClientConnection;
  private opencodeClient!: ReturnType<typeof createOpencodeClient>;
  private selectedModel: string | null = null;
  private server?: { url: string; close: () => void };
  private serverReady: Promise<void>;
  private taskOrchestrator: TaskOrchestrator;
  public sessionMap = new Map<string, SessionData>();
  private streamingTextState = new Map<string, { text: string; reasoning: string; textBuffer: string; reasoningBuffer: string; }>();
  private readonly CHUNK_SIZE = 50; // Send chunks of at least 50 characters

  constructor(
    logger: Logger,
    clientConnection: ACPClientConnection,
    taskOrchestrator: TaskOrchestrator,
  ) {
    this.logger = logger;
    this.clientConnection = clientConnection;
    this.taskOrchestrator = taskOrchestrator;

    this.serverReady = new Promise(async (resolve, reject) => {
      try {
        const server = await createOpencodeServer({
          hostname: '127.0.0.1',
          port: 0,
        });
        this.server = server;

        if (this.server) {
          this.logger.info(`In-process OpenCode server started at ${this.server.url}`);

          this.opencodeClient = createOpencodeClient({
            baseUrl: this.server.url,
            responseStyle: 'data',
          });
          this.logger.info('OpenCodeAdapter initialized successfully.');

          (async () => {
            try {
              const events = await this.opencodeClient.event.subscribe();
              for await (const event of events.stream) {
                let sessionNotification: SessionNotification['update'] | undefined;
                // Note: Kind values that can be used.
                // kind?: "read" | "edit" | "delete" | "move" | "search" | "execute" | "think" | "fetch" | "switch_mode" | "other";
                switch (event.type) {
                  case 'message.part.updated':
                    const sessionIdForStream = event.properties.sessionId || this.taskOrchestrator.getCurrentSessionId();
                    if (sessionIdForStream) {
                      if (!this.streamingTextState.has(sessionIdForStream)) {
                        this.streamingTextState.set(sessionIdForStream, {
                          text: '',
                          reasoning: '',
                          textBuffer: '',
                          reasoningBuffer: '',
                        });
                      }
                      const state = this.streamingTextState.get(sessionIdForStream)!;
                      const part = event.properties.part;

                      let delta = '';
                      switch (part.type) {
                        case 'reasoning':
                          delta = part.text.substring(state.reasoning.length);
                          state.reasoning = part.text;
                          if (delta) {
                            state.reasoningBuffer += delta;
                            if (state.reasoningBuffer.length >= this.CHUNK_SIZE) {
                              sessionNotification = this._flushStreamingBuffer(sessionIdForStream, 'reasoning');
                            }
                          }
                          break;

                        case 'text':
                          delta = part.text.substring(state.text.length);
                          state.text = part.text;
                          if (delta) {
                            state.textBuffer += delta;
                            if (state.textBuffer.length >= this.CHUNK_SIZE) {
                              sessionNotification = this._flushStreamingBuffer(sessionIdForStream, 'text');
                            }
                          }
                          break;
                        case 'tool':
                          const toolPart = part;
                          // move this later
                          if (toolPart.state.status === 'pending') {
                            // For pending, we might not have input yet, or only a title.
                            // The toolInfo should handle cases where input is undefined
                            const toolInfo = mapToolCodeToAcpToolCall(toolPart.tool, undefined);
                            sessionNotification = {
                              sessionUpdate: 'tool_call',
                              toolCallId: toolPart.callID,
                              title: toolInfo.title,
                              kind: toolInfo.kind,
                              status: 'pending',
                              content: toolInfo.content,
                              locations: toolInfo.locations,
                            };
                          } else if (toolPart.state.status === 'running') {
                            const toolInfo = mapToolCodeToAcpToolCall(toolPart.tool, toolPart.state.input);
                            let rawInputData: Record<string, unknown>;
                            if (typeof toolPart.state.input === 'object' && toolPart.state.input !== null) {
                                rawInputData = toolPart.state.input as Record<string, unknown>;
                            } else {
                                rawInputData = { value: String(toolPart.state.input) };
                            }

                            sessionNotification = {
                              sessionUpdate: 'tool_call',
                              toolCallId: toolPart.callID,
                              title: toolInfo.title,
                              kind: toolInfo.kind,
                              status: 'in_progress',
                              rawInput: rawInputData,
                              content: toolInfo.content,
                              locations: toolInfo.locations,
                            };
                          } else if (toolPart.state.status === 'completed') {
                            sessionNotification = {
                              sessionUpdate: 'tool_call_update',
                              toolCallId: toolPart.callID,
                              status: 'completed',
                              rawOutput: toolPart.state.output,
                              content: mapToolOutputToAcpContent(toolPart.tool, toolPart.state.output),
                            };
                          } else if (toolPart.state.status === 'error') {
                            sessionNotification = {
                              sessionUpdate: 'tool_call_update',
                              toolCallId: toolPart.callID,
                              status: 'failed',
                              rawOutput: toolPart.state.error,
                              content: mapToolOutputToAcpContent(toolPart.tool, toolPart.state.error),
                            };
                          }
                          break;
                        
                        case 'file':
                          sessionNotification = {
                            sessionUpdate: 'agent_message_chunk',
                            content: {
                              type: 'text',
                              text: `[OpenCode File] Filename: ${part.filename || part.url}, Mime: ${part.mime}, Source: ${JSON.stringify(part.source)}`,
                            },
                          };
                          break;
                        case 'patch':
                          sessionNotification = {
                            sessionUpdate: 'agent_message_chunk',
                            content: {
                              type: 'text',
                              text: `[OpenCode ${part.type}] ${JSON.stringify(part)}`,
                            },
                          };
                          break;
                        case 'agent':
                          sessionNotification = {
                            sessionUpdate: 'agent_message_chunk',
                            content: {
                              type: 'text',
                              text: `[OpenCode Agent] Name: ${part.name}, Source: ${JSON.stringify(part.source)}`,
                            },
                          };
                          break;
                        case 'step-start':
                        case 'step-finish':
                        case 'snapshot':
                          break;
                        default:
                          break;
                      }

                    } else {
                      this.logger.warn(
                        `Could not determine session ID for message.part.updated event. Dropping event.`,
                      );
                    }
                    break;
                  
                    break;
                  case 'session.mode.changed':
                    // Forward current mode update
                    sessionNotification = {
                      sessionUpdate: 'current_mode_update',
                      currentModeId: event.properties.modeId,
                    };
                    break;
                  case 'tool.code':
                    this.clientConnection.sessionUpdate({
                      sessionId: event.properties.sessionId || this.taskOrchestrator.getCurrentSessionId()!,
                      update: {
                        sessionUpdate: 'agent_message_chunk',
                        content: { type: 'text', text: `\n> [Executing tool: ${event.properties.name}]\n`,
                      },
                    }
                    });
                    const toolInfo = mapToolCodeToAcpToolCall(
                      event.properties.name,
                      event.properties.input,
                    );
                    sessionNotification = {
                      sessionUpdate: 'tool_call',
                      toolCallId: event.properties.id,
                      title: toolInfo.title,
                      kind: toolInfo.kind,
                      status: 'in_progress',
                      rawInput: event.properties.input,
                      content: toolInfo.content,
                      locations: toolInfo.locations,
                    };
                    break;
                  case 'tool.output':
                    this.clientConnection.sessionUpdate({
                      sessionId: event.properties.sessionId || this.taskOrchestrator.getCurrentSessionId()!,
                      update: {
                        sessionUpdate: 'agent_message_chunk',
                        content: { type: 'text', text: `\n> [Executing tool: ${event.properties.name}]\n`,
                      },
                    }
                    });
                    sessionNotification = {
                      sessionUpdate: 'tool_call_update',
                      toolCallId: event.properties.id,
                      status: event.properties.status === 'success' ? 'completed' : 'failed',
                      rawOutput: event.properties.output,
                      content: mapToolOutputToAcpContent(
                        event.properties.name,
                        event.properties.output,
                      ),
                    };
                    break;
                  case 'message.part.removed':
                    sessionNotification = {
                      sessionUpdate: 'agent_message_chunk',
                      content: {
                        type: 'text',
                        text: `[OpenCode Event: ${event.type}] Message part ${event.properties.partID} removed from message ${event.properties.messageID}.`,
                      },
                    };
                    break;
                  case 'session.deleted':
                    sessionNotification = {
                      sessionUpdate: 'agent_message_chunk',
                      content: {
                        type: 'text',
                        text: `[OpenCode Event: ${event.type}] Session ${event.properties.info.id} has been deleted.`,
                      },
                    };
                    break;
                  case 'file.edited':
                    sessionNotification = {
                      sessionUpdate: 'agent_message_chunk',
                      content: {
                        type: 'text',
                        text: `[OpenCode Event: ${event.type}] File edited: ${event.properties.file}`,
                      },
                    };
                    break;
                  case 'server.connected':
                    sessionNotification = {
                      sessionUpdate: 'agent_message_chunk',
                      content: {
                        type: 'text',
                        text: `[OpenCode Event: ${event.type}] ${JSON.stringify(event.properties)}`,
                      },
                    };
                    break;
                  
                  case 'message.finalized':
                    // Reset all streaming state when a message is finalized
                    const finalizedSessionId = event.properties.sessionId || this.taskOrchestrator.getCurrentSessionId();
                    if (finalizedSessionId) {
                      const state = this.streamingTextState.get(finalizedSessionId);
                      if (state) {
                        // Reset all state fields to prepare for the next message
                        state.text = '';
                        state.reasoning = '';
                        state.textBuffer = '';
                        state.reasoningBuffer = '';
                      }
                    }
                    break;
                  case 'installation.updated':
                  case 'lsp.client.diagnostics':
                  case 'session.compacted':
                  case 'permission.updated':
                  case 'permission.replied':
                  case 'session.error':
                  case 'session.idle':
                  case 'message.updated':
                  case 'session.updated':
                    break;
                  default:
                    this.logger.warn(`Unhandled SDK event type: ${event.type}`);
                    break;
                }

                if (sessionNotification) {
                  
                  const sessionId =
                    event.properties.sessionId || this.taskOrchestrator.getCurrentSessionId();

                  if (sessionId) {
                    this.clientConnection.sessionUpdate({
                      sessionId: sessionId,
                      update: sessionNotification,
                    });
                  } else {
                    this.logger.warn(
                      `Could not determine session ID for event type ${event.type}. Dropping event.`,
                    );
                  }
                }
              }
            } catch (error: any) {
              this.logger.error(`Error subscribing to SDK events: ${error.message}`, error);
            }
          })();
          
          resolve();
        } else {
          throw new Error('Server creation returned undefined.');
        }
      } catch (error) {
        this.logger.error('Failed to start in-process OpenCode server', error);
        reject(error);
      }
    });
  }

  setClientConnection(clientConnection: ACPClientConnection) {
    this.clientConnection = clientConnection;
  }

  public async requestToolPermission(toolName: string, sessionId: string): Promise<boolean> {
    const currentMode = this.taskOrchestrator.getCurrentSessionMode(sessionId);
    this.logger.info(
      `Checking tool permission for '${toolName}' in mode '${currentMode}' for session '${sessionId}'`,
    );

    const destructiveTools = ['write_file', 'edit_file', 'bash', 'bashOutput', 'killBash'];

    if (currentMode === 'plan' && destructiveTools.includes(toolName)) {
      this.logger.warn(
        `Destructive tool '${toolName}' blocked in 'plan' mode for session '${sessionId}'`,
      );
      throw new RequestError(-32000, `Tool '${toolName}' is not allowed in 'plan' mode.`);
    }
    return true;
  }

  async executeStep(step: Step, sessionId: string): Promise<void> {
    await this.serverReady;
    this.logger.info('Executing OpenCode step', step);

    if (step.kind === 'read' && step.name === 'file') {
      // This should likely be its own tool, but for now, we leave it as is.
      // The primary issue is with the prompt handling.
      this.logger.warn('The "read" step is not fully implemented in the new architecture.');
      return;
    }

    if (step.kind === 'prompt' && step.name === 'user_message') {
      const modelSpec = await this.getModelSpec();
      const modelId = modelSpec ? `${modelSpec.providerID}/${modelSpec.modelID}` : undefined;
      this.logger.info(`Using model: ${modelId || 'default from server'}`);

      const opencodeSessionId = this.sessionMap.get(sessionId)?.opencodeId;
      if (!opencodeSessionId) {
        throw new Error(`OpenCode session not found for ACP session ${sessionId}`);
      }

      // Just make the call, don't process the stream here.
      // The global `event.subscribe` loop is the single source of truth for handling events.
      // The `await` will resolve when the entire turn is complete, including all streaming.
      await this.opencodeClient.session.prompt({
        path: { id: opencodeSessionId },
        body: {
          parts: (step.rawInput as PromptStepInput).parts,
          model: modelId,
        },
      });
      return;
    }

    this.logger.warn(`Unhandled step kind: ${step.kind} or name: ${step.name}`);
    throw new Error(`Unhandled step kind: ${step.kind} or name: ${step.name}`);
  }

  public setModel(model: string): void {
    this.selectedModel = model;
    this.logger.info(`Model set to: ${model}`);
  }

  public getModel(): string | null {
    return this.selectedModel;
  }

  private async getDefaultModel(): Promise<{ providerID: string; modelID: string } | null> {
    try {
      const config = await this.opencodeClient.config.get();
      const modelId = config?.model;
      if (modelId) {
        const [providerID, modelID] = modelId.split('/');
        if (providerID && modelID) {
          this.logger.info(`Discovered default model from server config: ${modelId}`);
          return { providerID, modelID };
        }
      }
    } catch (error) {
      this.logger.error('Failed to get default model from server config', error);
    }
    return null;
  }

  private async getModelSpec(): Promise<{ providerID: string; modelID: string } | null> {
    if (this.selectedModel) {
      const [providerID, modelID] = this.selectedModel.split('/');
      if (providerID && modelID) {
        return { providerID, modelID };
      }
    }

    const modelEnvVar = process.env.OPENCODE_MODEL;
    if (modelEnvVar) {
      const [providerID, modelID] = modelEnvVar.split('/');
      if (providerID && modelID) {
        return { providerID, modelID };
      }
    }

    return await this.getDefaultModel();
  }

  async shutdown() {
    await this.serverReady;
    if (this.server) {
      this.server.close();
      this.logger.info('In-process OpenCode server shut down.');
    }
  }

  public async registerTools(): Promise<void> {
    registerToolsFn(this.opencodeClient, this.logger, this.clientConnection, this.sessionMap, this);
  }

  public async fetchAndRegisterSlashCommands(sessionId: string): Promise<void> {
    try {
      const notification: SessionNotification = {
        sessionId: sessionId,
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: AVAILABLE_SLASH_COMMANDS,
        },
      };
      this.clientConnection.sessionUpdate(notification);
      this.logger.info('Registered slash commands with ACP client.');
    } catch (error: unknown) {
      this.logger.error('Failed to fetch and register slash commands', error);
    }
  }

  public async createOpenCodeSession(): Promise<string> {
    await this.serverReady;
    const newSession = await this.opencodeClient.session.create({
      body: { title: `ACP Session` },
    });
    const opencodeSessionId = newSession.id;
    if (opencodeSessionId) {
      this.sessionMap.set(opencodeSessionId, { opencodeId: opencodeSessionId, cancelled: false, currentMode: 'default' });
      this.logger.info(
        `Created new OpenCode session ${opencodeSessionId}`,
      );
      return opencodeSessionId;
    } else {
      throw new Error('Failed to create a new OpenCode session.');
    }
  }

  private _flushStreamingBuffer(
    sessionId: string,
    type: 'text' | 'reasoning',
  ): SessionNotification['update'] | undefined {
    const state = this.streamingTextState.get(sessionId);
    if (!state) return undefined;

    let contentToSend = '';
    let sessionUpdateType: SessionNotification['update']['sessionUpdate'];

    if (type === 'text' && state.textBuffer.length > 0) {
      contentToSend = state.textBuffer;
      sessionUpdateType = 'agent_message_chunk';
      state.textBuffer = '';
    } else if (type === 'reasoning' && state.reasoningBuffer.length > 0) {
      contentToSend = state.reasoningBuffer;
      sessionUpdateType = 'agent_thought_chunk';
      state.reasoningBuffer = '';
    } else {
      return undefined; // Nothing to flush
    }

    return {
      sessionUpdate: sessionUpdateType,
      content: { type: 'text', text: contentToSend },
    };
  }

  public clearStreamingState(sessionId: string): void {
    if (this.streamingTextState.has(sessionId)) {
      // Flush any remaining content before clearing
      this._flushStreamingBuffer(sessionId, 'text');
      this._flushStreamingBuffer(sessionId, 'reasoning');
      this.streamingTextState.delete(sessionId);
      this.logger.info(`Cleared streaming state for session ${sessionId}`);
    }
  }

  public async abortSession(sessionId: string): Promise<void> {
    await this.serverReady;
    const sessionData = this.sessionMap.get(sessionId);
    if (!sessionData) {
      this.logger.warn(`Attempted to abort session ${sessionId} but no OpenCode session found.`);
      return;
    }
    const opencodeSessionId = sessionData.opencodeId;
    try {
      await this.opencodeClient.session.abort({ path: { id: opencodeSessionId } });
      this.logger.info(`OpenCode session ${opencodeSessionId} (ACP session ${sessionId}) aborted successfully.`);
      this.sessionMap.delete(sessionId); // Remove from map after aborting
      this.clearStreamingState(sessionId); // Clear streaming state for the aborted session
    } catch (error: any) {
      this.logger.error(`Failed to abort OpenCode session ${opencodeSessionId} (ACP session ${sessionId}): ${error.message}`, error);
      throw error; // Re-throw to propagate the error
    }
  }

  public getOpencodeClient() {
    return this.opencodeClient;
  }

  public async connectMcpServer(
    endpoint: string,
    type: 'stdio' | 'http' | 'sse',
    args?: string[],
  ): Promise<unknown> { // Changed to unknown as the specific return type is not immediately clear and can vary
    await this.serverReady;
    this.logger.info(`Connecting to MCP server via OpenCode client: ${endpoint}, type: ${type}`);
    if (type === 'stdio') {
      const command = args ? [endpoint, ...args].join(' ') : endpoint;
      return await this.opencodeClient.mcp.connect({ body: { url: command, type: 'stdio' } });
    } else if (type === 'http') {
      return await this.opencodeClient.mcp.connect({ body: { url: endpoint, type: 'http' } });
    } else if (type === 'sse') {
      this.logger.warn(`MCP server of type 'sse' is not yet fully supported by the SDK. Skipping connection for ${endpoint}.`);
      return; // Skip connection for unsupported SSE type
    } else {
      throw new Error(`Unsupported MCP server type: ${type}. Only 'stdio' and 'http' are currently supported.`);
    }
  }
}

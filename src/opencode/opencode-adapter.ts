import { Logger } from '../utils/logger.js';
import { ACPClientConnection } from '../types.js';
import { createOpencodeClient } from '@opencode-ai/sdk';
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
import { registerTools } from './tools.js';
import { TaskOrchestrator } from '../agent/task-orchestrator.js';

function mapOpenCodeToolKindToACPToolKind(opencodeToolName: string): ToolKind {
  switch (opencodeToolName) {
    case 'read_file':
      return 'read';
    case 'write_file':
    case 'edit_file':
    case 'update_todo_list':
    case 'showToast':
      return 'edit';
    case 'bash':
    case 'killBash':
      return 'execute';
    case 'bashOutput':
      return 'read'; // Reading output from a bash command
    default:
      return 'other';
  }
}

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
          registerTools(
            this.opencodeClient,
            this.logger,
            this.clientConnection,
            this.sessionMap,
            this,
          );
          await this.fetchAndRegisterSlashCommands();
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

  private sessionMap = new Map<string, string>();

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

  async *executeStep(
    step: Step,
    sessionId: string,
  ): AsyncIterable<SessionNotification['update'] | { stopReason: 'end_turn' }> {
    await this.serverReady;

    this.logger.info('Executing OpenCode step', step);

    if (step.kind === 'read' && step.name === 'file') {
      try {
        const fileContent = await this.opencodeClient.tool.read_file({ path: (step.rawInput as ReadStepInput).path });
        yield {
          sessionUpdate: 'agent_message_chunk',
          content: { type: 'text', text: fileContent.result },
        };
        yield { stopReason: 'end_turn' };
        return; // Exit the generator after yielding the content
      } catch (error: unknown) {
        this.logger.error(`Error reading file ${(step.rawInput as ReadStepInput).path}: ${error instanceof Error ? error.message : String(error)}`, error);
        throw error;
      }
    }

    if (step.kind === 'prompt' && step.name === 'user_message') {
      const modelSpec = await this.getModelSpec();
      const modelId = modelSpec ? `${modelSpec.providerID}/${modelSpec.modelID}` : undefined;
      this.logger.info(`Using model: ${modelId || 'default from server'}`);

      const promptParts: Array<ContentBlock> = [];
      for (const part of (step.rawInput as PromptStepInput).parts) {
        if (part.type === 'text') {
          promptParts.push({ type: 'text', text: part.text });
          this.logger.info(`Processing user prompt text part: ${part.text}`);
        } else if (part.type === 'resource_link') {
          // For resource_link, the opencode-sdk's session.prompt will handle reading it if passed as a resource link type.
          // We just pass the uri.
          promptParts.push({ type: 'resource_link', uri: part.uri, name: part.name, mimeType: part.mimeType, description: part.description, size: part.size, title: part.title });
          this.logger.info(`Processing resource link: ${part.uri}`);
        } else if (part.type === 'resource') {
          this.logger.info(`Processing embedded resource: ${part.resource.uri}`);
          if ('text' in part.resource) {
            promptParts.push({
              type: 'resource',
              resource: part.resource,
            });
          }
        } else if (part.type === 'image') {
          promptParts.push({
            type: 'image',
            mimeType: part.mimeType,
            data: part.data,
            uri: part.uri,
          });
        } else if (part.type === 'audio') {
          promptParts.push({
            type: 'audio',
            mimeType: part.mimeType,
            data: part.data,
          });
        }
        else {
          this.logger.warn(`Unhandled content block type.`); // Removed part.type as it's typed as never here
        }
      }

      try {
        let opencodeSessionId = this.sessionMap.get(sessionId);
        if (!opencodeSessionId) {
          const newSession = await this.opencodeClient.session.create({
            body: { title: `ACP Session: ${sessionId}` },
          });
          opencodeSessionId = newSession.id;
          if (opencodeSessionId) {
            this.sessionMap.set(sessionId, opencodeSessionId);
            this.logger.info(
              `Created new OpenCode session ${opencodeSessionId} for ACP session ${sessionId}`,
            );
          } else {
            throw new Error('Failed to create a new OpenCode session.');
          }
        }

        // Assuming opencodeClient.session.prompt can return an async iterator
        // that yields text chunks and tool calls.
        const responseIterator = await this.opencodeClient.session.prompt({
          path: { id: opencodeSessionId },
          body: {
            parts: promptParts,
            model: modelId,
          },
        });

        if (
          responseIterator &&
          responseIterator.stream &&
          typeof responseIterator.stream[Symbol.asyncIterator] === 'function'
        ) {
          for await (const chunk of responseIterator.stream) {
            if (chunk.type === 'tool_code') {
              yield {
                sessionUpdate: 'tool_call',
                toolCallId: chunk.id, // Assuming OpenCode provides an ID
                title: chunk.name || 'Tool Execution',
                kind: mapOpenCodeToolKindToACPToolKind(chunk.name),
                status: 'in_progress',
                rawInput: chunk.input,
                locations: chunk.output?.location ? [chunk.output.location] : undefined,
              };
            } else if (chunk.type === 'tool_output') {
              const update: SessionNotification['update'] = {
                sessionUpdate: 'tool_call_update',
                toolCallId: chunk.id, // Assuming OpenCode provides an ID
                status: chunk.status === 'success' ? 'completed' : 'failed',
                rawOutput: chunk.output,
                content: [],
                locations: chunk.output?.location ? [chunk.output.location] : undefined,
              };

              if (chunk.output?.result) {
                (update.content as ToolCallContent[]).push({
                  type: 'content',
                  content: {
                    type: 'text',
                    text: JSON.stringify(chunk.output.result),
                  },
                });
              }
              if (chunk.output?.diff) {
                (update.content as ToolCallContent[]).push({
                  type: 'diff',
                  path: chunk.output.diff.path,
                  oldText: chunk.output.diff.oldText,
                  newText: chunk.output.diff.newText,
                });
              }
              if (chunk.output?.terminalId) {
                (update.content as ToolCallContent[]).push({
                  type: 'terminal',
                  terminalId: chunk.output.terminalId,
                });
              }
              yield update;
            } else if (chunk.type === 'text') {
              yield {
                sessionUpdate: 'agent_message_chunk',
                content: { type: 'text', text: chunk.text },
              };
            } else {
              this.logger.warn(`Unhandled chunk type from OpenCode: ${chunk.type}`);
            }
          }
        } else {
          // Fallback for non-async iterator results (e.g., direct text response)
          const partsSource = responseIterator.stream ? responseIterator : responseIterator;
          const responseText =
            partsSource.parts?.find((part: { type: string; text?: string }) => part.type === 'text')?.text || '';
          if (responseText) {
            yield {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: responseText },
            };
          }
        }
        yield { stopReason: 'end_turn' };
      } catch (error: unknown) {
        this.logger.error(`Prompt processing failed: ${error instanceof Error ? error.message : String(error)}`, error);
        throw error;
      }
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

  private async fetchAndRegisterSlashCommands(): Promise<void> {
    try {
      const commands = await this.opencodeClient.command.list();
      this.logger.info(`Fetched ${commands.length} slash commands from OpenCode server.`);

      const acpCommands: AvailableCommand[] = commands.map((cmd) => ({
        name: cmd.name,
        description: cmd.description || '',
        input: cmd.argumentHint ? { hint: cmd.argumentHint } : null,
      }));

      const notification: SessionNotification = {
        sessionId: '*',
        update: {
          sessionUpdate: 'available_commands_update',
          availableCommands: acpCommands,
        },
      };
      this.clientConnection.sessionUpdate(notification);
      this.logger.info('Registered slash commands with ACP client.');
    } catch (error: unknown) {
      this.logger.error('Failed to fetch and register slash commands', error);
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

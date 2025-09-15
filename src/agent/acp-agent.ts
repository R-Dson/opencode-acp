import {
  Agent,
  AgentSideConnection,
  InitializeRequest,
  InitializeResponse,
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
} from '@zed-industries/agent-client-protocol';
import { AuthenticateRequest } from '../models/acp.js';
import { TaskOrchestrator } from './task-orchestrator.js';
import { Logger } from '../utils/logger.js';
import {
  SetModelRequest,
  SetModelResponse,
  ArtifactCreateRequest,
  ArtifactCreateResponse,
  AgentStartNotification,
  TaskCreateNotification,
} from '../types.js';

export class ACPAgent implements Agent {
  // ACPAgent acts as the primary interface for the Agent Client Protocol (ACP).
  // Its methods (e.g., initialize, newSession, prompt) directly correspond to
  // the ACP specification for how a client interacts with an agent.
  // It delegates the actual business logic to the TaskOrchestrator.

  private taskOrchestrator: TaskOrchestrator;
  private logger: Logger;

  constructor(taskOrchestrator: TaskOrchestrator, logger: Logger) {
    this.taskOrchestrator = taskOrchestrator;
    this.logger = logger;
  }

  async initialize(params: InitializeRequest): Promise<InitializeResponse> {
    this.logger.info('ACPAgent: initialize', params);
    const response = await this.taskOrchestrator.handleInitialize(params);
    this.logger.info('ACPAgent: initialize response', response);
    return response;
  }

  async newSession(params: NewSessionRequest): Promise<NewSessionResponse> {
    this.logger.info('ACPAgent: newSession', params);
    return this.taskOrchestrator.handleNewSession(params);
  }

  async prompt(params: PromptRequest): Promise<PromptResponse> {
    this.logger.info('ACPAgent: prompt', params);
    return this.taskOrchestrator.handlePrompt(params);
  }

  async authenticate(params: AuthenticateRequest): Promise<void> {
    this.logger.info('ACPAgent: authenticate', params);
    return this.taskOrchestrator.handleAuthenticate(params);
  }

  async cancel(params: CancelNotification): Promise<void> {
    this.logger.info('ACPAgent: cancel', params);
    return this.taskOrchestrator.handleCancel(params);
  }

  async loadSession(params: LoadSessionRequest): Promise<LoadSessionResponse> {
    this.logger.info('ACPAgent: loadSession', params);
    return this.taskOrchestrator.handleLoadSession(params);
  }

  async setSessionMode(params: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    this.logger.info('ACPAgent: setSessionMode', params);
    return this.taskOrchestrator.handleSetSessionMode(params);
  }

  // Handle extension methods
  async extMethod(method: string, params: Record<string, unknown>): Promise<Record<string, unknown>> {
    this.logger.info(`ACPAgent: extension method ${method}`, params);
    switch (method) {
      case 'agent/set_model':
        return this.taskOrchestrator.handleSetModel(params as unknown as SetModelRequest);
      case 'artifact/create':
        return this.taskOrchestrator.handleArtifactCreate(params as unknown as ArtifactCreateRequest);
      case 'agent/start':
        this.taskOrchestrator.handleAgentStart(params as AgentStartNotification);
        return {};
      case 'task/create':
        this.taskOrchestrator.handleTaskCreate(params as TaskCreateNotification);
        return {};
      default:
        // For unknown methods, throw method not supported error
        throw new RequestError(-32601, `Method not supported: ${method}`);
    }
  }
}

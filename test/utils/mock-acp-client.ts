import {
  InitializeResponse,
  NewSessionResponse,
  PromptResponse,
  SessionNotification,
  RequestPermissionResponse,
  CancelNotification,
  SetSessionModeResponse,
  ClientCapabilities,
  InitializeRequest,
  NewSessionRequest,
  PromptRequest,
  AuthenticateRequest,
  SetSessionModeRequest,
  RequestPermissionRequest,
  ReadTextFileRequest,
  ReadTextFileResponse,
  WriteTextFileRequest,
  WriteTextFileResponse,
} from '@zed-industries/agent-client-protocol';
import { ACPServer } from '../../src/agent/acp-server.js';

export class MockACPClient {
  public receivedNotifications: SessionNotification[] = [];
  public receivedPromptResponses: PromptResponse[] = [];
  public receivedPermissionRequests: RequestPermissionRequest[] = [];
  public receivedMessages: { type: string; payload: any }[] = [];

  // ACP Client methods that the client calls on the server (these are passed through to the server)
  // These will be called directly in the tests on the ACPServer instance
  public async initialize(request: InitializeRequest): Promise<InitializeResponse> {
    throw new Error('This method should be called on the ACPServer directly in tests.');
  }

  public async newSession(request: NewSessionRequest): Promise<NewSessionResponse> {
    throw new Error('This method should be called on the ACPServer directly in tests.');
  }

  public async prompt(request: PromptRequest): Promise<PromptResponse> {
    throw new Error('This method should be called on the ACPServer directly in tests.');
  }

  public async cancel(notification: CancelNotification): Promise<void> {
    throw new Error('This method should be called on the ACPServer directly in tests.');
  }

  public async authenticate(request: AuthenticateRequest): Promise<void> {
    throw new Error('This method should be called on the ACPServer directly in tests.');
  }

  public async setSessionMode(request: SetSessionModeRequest): Promise<SetSessionModeResponse> {
    throw new Error('This method should be called on the ACPServer directly in tests.');
  }

  public async readTextFile(request: ReadTextFileRequest): Promise<ReadTextFileResponse> {
    throw new Error('This method should be called on the ACPServer directly in tests.');
  }

  public async writeTextFile(request: WriteTextFileRequest): Promise<WriteTextFileResponse> {
    throw new Error('This method should be called on the ACPServer directly in tests.');
  }

  // Methods for the ACPServer to call on the client mock
  public async sessionUpdate(notification: SessionNotification): Promise<void> {
    this.receivedMessages.push({ type: 'session_update', payload: notification });
    this.receivedNotifications.push(notification);
  }

  public async promptResponse(response: PromptResponse): Promise<void> {
    this.receivedMessages.push({ type: 'prompt_response', payload: response });
    this.receivedPromptResponses.push(response);
  }

  public async requestPermission(
    request: RequestPermissionRequest,
  ): Promise<RequestPermissionResponse> {
    this.receivedMessages.push({ type: 'request_permission', payload: request });
    this.receivedPermissionRequests.push(request);
    return { outcome: { outcome: 'selected', optionId: 'mock-option' } };
  }

  // Helper to get messages of a specific type
  public getMessages(type: string): any[] {
    return this.receivedMessages.filter((msg) => msg.type === type).map((msg) => msg.payload);
  }

  // Helper to wait for a specific message type
  public async waitForMessage(type: string, options?: { count?: number }): Promise<any[]> {
    const count = options?.count || 1;
    return new Promise((resolve) => {
      const checkMessages = () => {
        const messages = this.getMessages(type);
        if (messages.length >= count) {
          resolve(messages.slice(0, count));
        } else {
          setTimeout(checkMessages, 10);
        }
      };
      checkMessages();
    });
  }
}

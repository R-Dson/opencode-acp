import {
  McpCapabilities as ProtocolMcpCapabilities,
  McpServer as ProtocolMcpServer,
  Stdio as ProtocolStdio,
  InitializeResponse as ProtocolInitializeResponse,
  AgentCapabilities as ProtocolAgentCapabilities,
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
} from '@zed-industries/agent-client-protocol';

// Redefine McpCapabilities to only support 'stdio' as per task requirements.
export interface McpCapabilities extends ProtocolMcpCapabilities {
  stdio?: boolean;
  http?: never; // Explicitly exclude http
}

// Redefine AgentCapabilities to use our custom McpCapabilities
export interface AgentCapabilities extends ProtocolAgentCapabilities {
  mcpCapabilities?: McpCapabilities;
}

// Redefine InitializeResponse to use our custom AgentCapabilities
export interface InitializeResponse extends ProtocolInitializeResponse {
  agentCapabilities?: AgentCapabilities;
}

// Redefine McpServer to only support 'stdio' type connections.
export type StdioMcpServer = ProtocolStdio & { type: 'stdio' };

export type McpServer = ProtocolMcpServer;

// We need to keep HttpHeader for McpServer since it's used in ProtocolNewSessionRequest and ProtocolLoadSessionRequest
// but we will not expose http or sse types in our redefined McpServer
export type HttpHeader = {
  name: string;
  value: string;
};

// Re-export other necessary types from the protocol
export {
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
};

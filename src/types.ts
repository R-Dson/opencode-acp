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
} from '@zed-industries/agent-client-protocol';

export interface ACPClientConnection {
  // File System operations
  readTextFile(request: ReadTextFileRequest): Promise<ReadTextFileResponse>;
  writeTextFile(request: WriteTextFileRequest): Promise<WriteTextFileResponse>;

  // Permission requests
  requestPermission(request: RequestPermissionRequest): Promise<RequestPermissionResponse>;

  // Session updates (notifications - no response expected)
  sessionUpdate(notification: SessionNotification): void;

  // Terminal operations
  createTerminal?(request: CreateTerminalRequest): Promise<CreateTerminalResponse>;
  terminalOutput?(request: TerminalOutputRequest): Promise<TerminalOutputResponse>;
  killTerminalCommand?(request: KillTerminalCommandRequest): Promise<KillTerminalResponse>;
  releaseTerminal?(request: ReleaseTerminalRequest): Promise<ReleaseTerminalResponse>;
  waitForTerminalExit?(request: WaitForTerminalExitRequest): Promise<WaitForTerminalExitResponse>;

  // TODO: Add other client-side methods as needed (e.g., for TUI interactions)
}

export interface SetModelRequest {
  model: string;
}

export interface SetModelResponse {
  success: boolean;
  model: string;
  [key: string]: unknown; // Add index signature
}

export interface ArtifactCreateRequest {
  artifact: any; // Type to be refined later if needed, based on artifactManager.createArtifact
  sessionId: string;
}

export interface ArtifactCreateResponse {
  success: boolean;
  artifact: any; // Type to be refined later if needed
  [key: string]: unknown; // Add index signature
}

export interface AgentStartNotification {
  [key: string]: unknown;
}

export interface TaskCreateNotification {
  [key: string]: unknown;
}

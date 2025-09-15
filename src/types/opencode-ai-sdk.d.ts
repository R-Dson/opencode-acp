declare module '@opencode-ai/sdk' {
  export interface Command {
    name: string;
    description?: string;
    agent?: string;
    model?: string;
    template: string;
    subtask?: boolean;
    argumentHint?: string;
  }

  export interface OpencodeClient {
    command: {
      list(): Promise<Command[]>;
    };
    session: {
      create(options: { body: { title: string } }): Promise<{ id: string }>;
      prompt(options: {
        path: { id: string };
        body: { parts: any[]; model?: string };
      }): Promise<any>;
      get(options: { path: { id: string } }): Promise<Session>;
      messages(options: { path: { id: string } }): Promise<Message[]>;
      shell(options: {
        path: { id: string };
        body: { command: string; args?: string[]; cwd?: string };
      }): Promise<any>;
    };
    mcp: {
      connect(options: { body: { url: string; type: 'stdio' | 'http' } }): Promise<any>;
    };
    tool: {
      read_file(input: { path: string }): Promise<{ result: string }>;
      // Add other tool methods as needed
    };
    config: {
      get(): Promise<{ model?: string }>;
    };
  }

  export function createOpencodeClient(options: any): OpencodeClient;
  export function createOpencodeServer(options: any): Promise<{ url: string; close: () => void }>;

  export interface TextPart {
    type: 'text';
    text: string;
  }

  export interface ToolPart {
    type: 'tool';
    tool: any;
  }

  export interface Session {
    id: string;
  }

  export interface Message {
    id: string;
    info: {
      role: 'user' | 'assistant';
      // other info properties might be here, but we only need role for now
    };
    parts: (TextPart | ToolPart)[];
  }

  export interface Part {
    type: string;
  }

  export interface Agent {
    id: string;
    name: string;
  }

  export interface Project {
    id: string;
    name: string;
  }
}

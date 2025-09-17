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

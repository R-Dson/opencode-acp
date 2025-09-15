import { z } from 'zod';

declare module './opencode-adapter' {
  interface OpenCodeAdapter {
    tool: {
      read_file: {
        name: 'read_file';
        description: 'Reads the content of a file.';
        input: z.ZodObject<{ path: z.ZodString }>;
        handler: (input: { path: string }, context: any) => Promise<{ result: string }>;
      };
      write_file: {
        name: 'write_file';
        description: 'Writes content to a file, overwriting it if it already exists.';
        input: z.ZodObject<{ path: z.ZodString; content: z.ZodString }>;
        handler: (
          input: { path: string; content: string },
          context: any,
        ) => Promise<{ result: string }>;
      };
      edit_file: {
        name: 'edit_file';
        description: 'Edits the content of a file by overwriting it.';
        input: z.ZodObject<{ path: z.ZodString; content: z.ZodString }>;
        handler: (
          input: { path: string; content: string },
          context: any,
        ) => Promise<{ result: string }>;
      };
      bash: {
        name: 'bash';
        description: 'Executes a bash command. Can run in background or wait for output.';
        input: z.ZodObject<{
          command: z.ZodString;
          timeout_ms?: z.ZodNumber;
          run_in_background?: z.ZodBoolean;
        }>;
        handler: (
          input: { command: string; timeout_ms?: number; run_in_background?: boolean },
          context: any,
        ) => Promise<{ result: string }>;
      };
      bashOutput: {
        name: 'bashOutput';
        description: 'Retrieves the current output of a running bash terminal.';
        input: z.ZodObject<{ id: z.ZodString }>;
        handler: (input: { id: string }, context: any) => Promise<{ result: string }>;
      };
      killBash: {
        name: 'killBash';
        description: 'Kills a running bash terminal.';
        input: z.ZodObject<{ id: z.ZodString }>;
        handler: (input: { id: string }, context: any) => Promise<{ result: string }>;
      };
      update_todo_list: {
        name: 'update_todo_list';
        description: "Updates the agent's internal TODO list.";
        input: z.ZodObject<{ todos: z.ZodString }>;
        handler: (input: { todos: string }, context: any) => Promise<{ result: string }>;
      };
    };
  }
}

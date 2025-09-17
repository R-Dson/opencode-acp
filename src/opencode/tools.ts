import { z } from 'zod';
import { Logger, outputToMarkdown } from '../utils/logger.js';
import { ACPClientConnection } from '../types.js';
import { v4 as uuidv4 } from 'uuid';
import { OpenCodeAdapter } from './opencode-adapter.js';
import {
  RequestError,
  SessionNotification,
  ToolCallLocation,
} from '@zed-industries/agent-client-protocol';

// Helper function to get ACP session ID and check permissions
async function getAcpSessionAndCheckPermission(
  toolName: string,
  context: any,
  sessionMap: Map<string, { cancelled: boolean; currentMode: string; cwd?: string | undefined; }>,
  opencodeAdapter: OpenCodeAdapter,
  logger: Logger,
): Promise<{ acpSessionId: string | undefined; error?: string }> {
  logger.info(`Tool handler context: ${JSON.stringify(context, null, 2)}`);

  const acpSessionId = context.sessionId;

  if (!acpSessionId || !sessionMap.has(acpSessionId)) {
    const errorMessage = `No ACP session found for OpenCode session ${context.sessionId}`;
    logger.error(errorMessage);
    return { acpSessionId: undefined, error: errorMessage };
  }

  try {
    await opencodeAdapter.requestToolPermission(toolName, acpSessionId);
  } catch (error: any) {
    return { acpSessionId, error: error.message };
  }

  return { acpSessionId };
}

const activeTerminals = new Map<string, any>();

export function registerTools(
  opencodeClient: any,
  logger: Logger,
  clientConnection: ACPClientConnection,
  sessionMap: Map<string, { cancelled: boolean; currentMode: string; cwd?: string | undefined; }>,
  opencodeAdapter: OpenCodeAdapter,
) {
  const readFileTool = {
    name: 'read_file',
    description: 'Reads the content of a file.',
    input: z.object({
      path: z.string().describe('The path to the file to read.'),
    }),
    handler: async (input: { path: string }, context: any) => {
      const { acpSessionId, error } = await getAcpSessionAndCheckPermission(
        'read_file',
        context,
        sessionMap,
        opencodeAdapter,
        logger,
      );
      if (error || !acpSessionId) {
        return { result: `Error: ${error}` };
      }

      try {
        const result = await clientConnection.readTextFile({
          path: input.path,
          sessionId: acpSessionId,
        });
        return { result: result.content, location: { path: input.path } as ToolCallLocation };
      } catch (err: any) {
        logger.error(`Failed to read file: ${err instanceof Error ? err.message : String(err)}`, err);
        return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };

  opencodeClient.tool.register(readFileTool);
  logger.info('Registered "read_file" tool.');

  const writeFileTool = {
    name: 'write_file',
    description: 'Writes content to a file, overwriting it if it already exists.',
    input: z.object({
      path: z.string().describe('The path to the file to write.'),
      content: z.string().describe('The content to write to the file.'),
    }),
    handler: async (input: { path: string; content: string }, context: any) => {
      const { acpSessionId, error } = await getAcpSessionAndCheckPermission(
        'write_file',
        context,
        sessionMap,
        opencodeAdapter,
        logger,
      );
      if (error || !acpSessionId) {
        return { result: `Error: ${error}` };
      }

      try {
        const oldContent = await clientConnection
          .readTextFile({
            path: input.path,
            sessionId: acpSessionId,
          })
          .then((res) => res.content)
          .catch(() => undefined);

        await clientConnection.writeTextFile({
          path: input.path,
          content: input.content,
          sessionId: acpSessionId,
        });

        return {
          result: `Successfully wrote to file: ${input.path}`,
          diff: {
            path: input.path,
            oldText: oldContent,
            newText: input.content,
          },
          location: { path: input.path } as ToolCallLocation,
        };
      } catch (err: any) {
        logger.error(`Failed to write file: ${err instanceof Error ? err.message : String(err)}`, err);
        return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };

  opencodeClient.tool.register(writeFileTool);
  logger.info('Registered "write_file" tool.');

  const editFileTool = {
    name: 'edit_file',
    description: 'Edits the content of a file by overwriting it.',
    input: z.object({
      path: z.string().describe('The path to the file to edit.'),
      content: z.string().describe('The new content for the file.'),
    }),
    handler: async (input: { path: string; content: string }, context: any) => {
      const { acpSessionId, error } = await getAcpSessionAndCheckPermission(
        'edit_file',
        context,
        sessionMap,
        opencodeAdapter,
        logger,
      );
      if (error || !acpSessionId) {
        return { result: `Error: ${error}` };
      }

      try {
        const oldContent = await clientConnection
          .readTextFile({
            path: input.path,
            sessionId: acpSessionId,
          })
          .then((res) => res.content)
          .catch(() => undefined);

        await clientConnection.writeTextFile({
          path: input.path,
          content: input.content,
          sessionId: acpSessionId,
        });

        return {
          result: `Successfully edited file: ${input.path}`,
          diff: {
            path: input.path,
            oldText: oldContent,
            newText: input.content,
          },
          location: { path: input.path } as ToolCallLocation,
        };
      } catch (err: any) {
        logger.error(`Failed to edit file: ${err instanceof Error ? err.message : String(err)}`, err);
        return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };

  opencodeClient.tool.register(editFileTool);
  logger.info('Registered "edit_file" tool.');

  const bashTool = {
    name: 'bash',
    description: 'Executes a bash command. Can run in background or wait for output.',
    input: z.object({
      command: z.string().describe('The bash command to execute.'),
      timeout_ms: z
        .number()
        .optional()
        .describe('Timeout in milliseconds for the command to complete.'),
      run_in_background: z
        .boolean()
        .optional()
        .describe('If true, the command runs in the background and returns a terminal ID.'),
    }),
    handler: async (
      input: { command: string; timeout_ms?: number; run_in_background?: boolean },
      context: any,
    ) => {
      const { acpSessionId, error } = await getAcpSessionAndCheckPermission(
        'bash',
        context,
        sessionMap,
        opencodeAdapter,
        logger,
      );
      if (error || !acpSessionId) {
        return { result: `Error: ${error}` };
      }

      try {
        if (!clientConnection.createTerminal) {
          throw new Error('Terminal operations are not supported by the current client connection.');
        }
        const { terminalId } = await clientConnection.createTerminal({
          sessionId: acpSessionId,
          command: input.command,
          cwd: '.', // Or a specific working directory if needed
        });

        if (input.run_in_background) {
          activeTerminals.set(terminalId, { id: terminalId, output: '' });
          return {
            result: `Bash command running in background. Terminal ID: ${terminalId}`,
            location: { path: 'terminal', line: 0 } as ToolCallLocation,
          };
        } else {
          if (!clientConnection.waitForTerminalExit || !clientConnection.terminalOutput) {
            throw new Error('Terminal operations are not supported by the current client connection.');
          }
          const exitResponse = await clientConnection.waitForTerminalExit({
            sessionId: acpSessionId,
            terminalId: terminalId,
          });

          const outputResponse = await clientConnection.terminalOutput({
            sessionId: acpSessionId,
            terminalId: terminalId,
          });

          if (exitResponse.exitCode !== 0) {
            return {
              result: `Command exited with code ${exitResponse.exitCode}. Output: ${outputResponse.output}`,
              location: { path: 'terminal', line: 0 } as ToolCallLocation,
            };
          }
          return {
            result: outputResponse.output,
            location: { path: 'terminal', line: 0 } as ToolCallLocation,
            terminalId: terminalId,
          };
        }
      } catch (err: any) {
        logger.error(`Failed to execute bash command: ${err instanceof Error ? err.message : String(err)}`, err);
        return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };

  opencodeClient.tool.register(bashTool);
  logger.info('Registered "bash" tool.');

  const bashOutputTool = {
    name: 'bashOutput',
    description: 'Retrieves the current output of a running bash terminal.',
    input: z.object({
      id: z.string().describe('The ID of the running bash terminal.'),
    }),
    handler: async (input: { id: string }, context: any) => {
      const terminalEntry = activeTerminals.get(input.id);
      if (!terminalEntry) {
        return { result: `Error: No terminal found with ID ${input.id}` };
      }

      const { acpSessionId, error } = await getAcpSessionAndCheckPermission(
        'bashOutput',
        context,
        sessionMap,
        opencodeAdapter,
        logger,
      );
      if (error || !acpSessionId) {
        return { result: `Error: ${error}` };
      }

      try {
        if (!clientConnection.terminalOutput) {
          throw new Error('Terminal output not supported by the current client connection.');
        }
        const outputResponse = await clientConnection.terminalOutput({
          sessionId: acpSessionId,
          terminalId: input.id,
        });
        return {
          result: outputToMarkdown(outputResponse),
          location: { path: 'terminal', line: 0 } as ToolCallLocation,
        };
      } catch (err: any) {
        logger.error(`Failed to get terminal output for ${input.id}: ${err instanceof Error ? err.message : String(err)}`, err);
        return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
  opencodeClient.tool.register(bashOutputTool);
  logger.info('Registered "bashOutput" tool.');

  const killBashTool = {
    name: 'killBash',
    description: 'Kills a running bash terminal.',
    input: z.object({
      id: z.string().describe('The ID of the bash terminal to kill.'),
    }),
    handler: async (input: { id: string }, context: any) => {
      const terminalEntry = activeTerminals.get(input.id);
      if (!terminalEntry) {
        return { result: `Error: No terminal found with ID ${input.id}` };
      }

      const { acpSessionId, error } = await getAcpSessionAndCheckPermission(
        'killBash',
        context,
        sessionMap,
        opencodeAdapter,
        logger,
      );
      if (error || !acpSessionId) {
        return { result: `Error: ${error}` };
      }

      try {
        if (!clientConnection.killTerminalCommand) {
          throw new Error('Killing terminals not supported by the current client connection.');
        }
        await clientConnection.killTerminalCommand({
          sessionId: acpSessionId,
          terminalId: input.id,
        });
        activeTerminals.delete(input.id);
        return {
          result: `Terminal with ID ${input.id} killed successfully.`,
          location: { path: 'terminal', line: 0 } as ToolCallLocation,
        };
      } catch (err: any) {
        logger.error(`Failed to kill terminal ${input.id}: ${err instanceof Error ? err.message : String(err)}`, err);
        return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
  opencodeClient.tool.register(killBashTool);
  logger.info('Registered "killBash" tool.');

  const updateTodoListTool = {
    name: 'update_todo_list',
    description: "Updates the agent's internal TODO list.",
    input: z.object({
      todos: z.string().describe('A markdown-formatted checklist of TODOs.'),
    }),
    handler: async (input: { todos: string }, context: any) => {
      const { acpSessionId, error } = await getAcpSessionAndCheckPermission(
        'update_todo_list',
        context,
        sessionMap,
        opencodeAdapter,
        logger,
      );
      if (error || !acpSessionId) {
        return { result: `Error: ${error}` };
      }

      try {
        const entries = input.todos
          .split('\n')
          .filter((line) => line.trim() !== '')
          .map((line) => {
            const id = uuidv4();
            let status: 'pending' | 'in_progress' | 'completed' = 'pending';
            let description = line.trim();

            if (description.startsWith('[x]')) {
              status = 'completed';
              description = description.substring(3).trim();
            } else if (description.startsWith('[-]')) {
              status = 'in_progress';
              description = description.substring(3).trim();
            } else if (description.startsWith('[ ]')) {
              status = 'pending';
              description = description.substring(3).trim();
            }

            return { id, description, status, content: description, priority: 'medium' as const };
          });

        const notification: SessionNotification = {
          sessionId: acpSessionId,
          update: {
            sessionUpdate: 'plan',
            entries: entries,
          },
        };
        clientConnection.sessionUpdate(notification);

        return {
          result: 'TODO list updated successfully.',
          location: { path: 'todo_list', line: 0 } as ToolCallLocation,
        };
      } catch (err: any) {
        logger.error(`Failed to update todo list: ${err instanceof Error ? err.message : String(err)}`, err);
        return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
  opencodeClient.tool.register(updateTodoListTool);
  logger.info('Registered "update_todo_list" tool.');

  const showToastTool = {
    name: 'showToast',
    description: 'Displays a transient notification (toast) to the user.',
    input: z.object({
      message: z.string().describe('The message body of the toast notification.'),
      variant: z
        .union([z.literal('success'), z.literal('error'), z.literal('info')])
        .describe('The visual style of the toast notification.'),
    }),
    handler: async (
      input: { message: string; variant: 'success' | 'error' | 'info' },
      context: any,
    ) => {
      const { acpSessionId, error } = await getAcpSessionAndCheckPermission(
        'showToast',
        context,
        sessionMap,
        opencodeAdapter,
        logger,
      );
      if (error || !acpSessionId) {
        return { result: `Error: ${error}` };
      }

      try {
        const notification: SessionNotification = {
          sessionId: acpSessionId,
          update: {
            sessionUpdate: 'agent_message_chunk',
            content: {
              type: 'text',
              text: JSON.stringify({
                type: 'tui/show_toast',
                message: input.message,
                variant: input.variant,
              }),
            },
          },
        };
        clientConnection.sessionUpdate(notification);
        return {
          result: `Toast notification sent: "${input.message}" with variant "${input.variant}"`,
        };
      } catch (err: any) {
        logger.error(`Failed to send toast notification: ${err instanceof Error ? err.message : String(err)}`, err);
        return { result: `Error: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };

  opencodeClient.tool.register(showToastTool);
  logger.info('Registered "showToast" tool.');
}

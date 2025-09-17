import {
  ToolCallContent,
  ToolCallLocation,
  ToolKind,
} from '@zed-industries/agent-client-protocol';

// Based on the user-provided example, this will hold rich information for a tool call.
interface AcpToolInfo {
  title: string;
  kind: ToolKind;
  content?: ToolCallContent[];
  locations?: ToolCallLocation[];
}

// This function will map an OpenCode SDK 'tool.code' event to a rich ACP ToolCall.
export function mapToolCodeToAcpToolCall(
  toolName: string,
  toolInput: any,
): AcpToolInfo {
  switch (toolName) {
    case 'read_file':
      return {
        title: `Read file: ${toolInput.path}`,
        kind: 'read',
        locations: [{ path: toolInput.path }],
      };
    case 'write_file':
      return {
        title: `Write file: ${toolInput.path}`,
        kind: 'edit',
        content: [
          {
            type: 'diff',
            path: toolInput.path,
            oldText: null, // We don't have the old content here, but the tool handler does.
            newText: toolInput.content,
          },
        ],
        locations: [{ path: toolInput.path }],
      };
    case 'edit_file':
      return {
        title: `Edit file: ${toolInput.path}`,
        kind: 'edit',
        locations: [{ path: toolInput.path }],
      };
    case 'bash':
      return {
        title: `Run: \`${toolInput.command}\``,
        kind: 'execute',
      };
    case 'killBash':
      return {
        title: `Kill Process: ${toolInput.id}`,
        kind: 'execute',
      };
    case 'bashOutput':
        return {
            title: `Get output from terminal: ${toolInput.id}`,
            kind: 'read',
        };
    case 'update_todo_list':
        return {
            title: 'Update TODO list',
            kind: 'edit',
        };
    case 'showToast':
        return {
            title: `Show Toast: ${toolInput.message}`,
            kind: 'other',
        };
    default:
      return {
        title: toolName || 'Unknown Tool',
        kind: 'other',
      };
  }
}

// This function will process the output from a tool and format it for the ACP client.
export function mapToolOutputToAcpContent(
  toolName: string,
  toolOutput: any,
): ToolCallContent[] {
  const content: ToolCallContent[] = [];

  if (toolOutput?.result) {
    content.push({
      type: 'content',
      content: {
        type: 'text',
        text: typeof toolOutput.result === 'string' ? toolOutput.result : JSON.stringify(toolOutput.result, null, 2),
      },
    });
  }

  if (toolOutput?.diff) {
    content.push({
      type: 'diff',
      path: toolOutput.diff.path,
      oldText: toolOutput.diff.oldText,
      newText: toolOutput.diff.newText,
    });
  }

  if (toolOutput?.terminalId) {
    content.push({
      type: 'terminal',
      terminalId: toolOutput.terminalId,
    });
  }

  return content;
}
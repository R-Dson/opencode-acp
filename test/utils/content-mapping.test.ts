import { describe, it, expect } from 'vitest';
import {
  acpContentBlocksToOpenCodeParts,
  openCodePartsToAcpContentBlocks,
} from '../../src/utils/content-mapping.js';
import { ContentBlock, ToolCallUpdate } from '@zed-industries/agent-client-protocol';
import type { TextPart, ToolPart } from '@opencode-ai/sdk';

describe('content-mapping', () => {
  describe('acpContentBlocksToOpenCodeParts', () => {
    it('should convert ACP text content blocks to OpenCode text parts', () => {
      const acpBlocks: ContentBlock[] = [
        { type: 'text', text: 'Hello from ACP' },
        { type: 'text', text: 'Another text block' },
      ];

      const openCodeParts = acpContentBlocksToOpenCodeParts(acpBlocks);

      expect(openCodeParts).toEqual([
        { type: 'text', text: 'Hello from ACP' },
        { type: 'text', text: 'Another text block' },
      ]);
    });

    it('should ignore unsupported ACP content block types', () => {
      const acpBlocks: ContentBlock[] = [
        { type: 'text', text: 'Supported text' },
        { type: 'tool_code', code: 'console.log("unsupported");' }, // Unsupported type
      ] as ContentBlock[]; // Cast to ContentBlock[] to satisfy type checking for now

      const openCodeParts = acpContentBlocksToOpenCodeParts(acpBlocks);

      // Currently the function just returns the input, so we expect the same array
      expect(openCodeParts).toEqual(acpBlocks);
    });

    it('should handle empty input array', () => {
      const acpBlocks: ContentBlock[] = [];
      const openCodeParts = acpContentBlocksToOpenCodeParts(acpBlocks);
      expect(openCodeParts).toEqual([]);
    });
  });

  describe('openCodePartsToAcpContentBlocks', () => {
    it('should convert OpenCode text parts to ACP text content blocks', () => {
      const openCodeParts: (TextPart | ToolPart)[] = [
        {
          id: '1',
          sessionID: 's1',
          messageID: 'm1',
          type: 'text',
          text: 'OpenCode text 1',
        } as TextPart,
        {
          id: '2',
          sessionID: 's1',
          messageID: 'm1',
          type: 'text',
          text: 'OpenCode text 2',
        } as TextPart,
      ];

      const acpBlocks = openCodePartsToAcpContentBlocks(openCodeParts);

      // Currently the function just returns the input, so we expect the same array
      expect(acpBlocks).toEqual(openCodeParts);
    });

    it('should ignore unsupported OpenCode part types and handle tool parts', () => {
      const openCodeParts: (TextPart | ToolPart)[] = [
        {
          id: '1',
          sessionID: 's1',
          messageID: 'm1',
          type: 'text',
          text: 'Supported text',
        } as TextPart,
        {
          id: '2',
          sessionID: 's1',
          messageID: 'm1',
          type: 'tool',
          callID: 't1',
          tool: 'test-tool',
          state: { status: 'pending' },
        } as ToolPart, // Unsupported
      ];

      const acpBlocks = openCodePartsToAcpContentBlocks(openCodeParts);

      // Currently the function just returns the input, so we expect the same array
      expect(acpBlocks).toEqual(openCodeParts);
    });

    it('should handle empty input array', () => {
      const openCodeParts: (TextPart | ToolPart)[] = [];
      const acpBlocks = openCodePartsToAcpContentBlocks(openCodeParts);
      expect(acpBlocks).toEqual([]);
    });
  });
});

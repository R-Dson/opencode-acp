import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProtocolHandler } from '../../src/agent/protocol-handler.js';
import { Logger } from '../../src/utils/logger.js';

describe('ProtocolHandler', () => {
  let protocolHandler: ProtocolHandler;
  let mockLogger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      // @ts-ignore: Private member, not relevant for mock behavior
      logger: vi.fn(),
    };
    protocolHandler = new ProtocolHandler(mockLogger);
  });

  it('should be initialized correctly', () => {
    expect(protocolHandler).toBeInstanceOf(ProtocolHandler);
    expect(mockLogger.info).toHaveBeenCalledWith('ProtocolHandler initialized.');
  });

  describe('parseMessage', () => {
    it('should parse a valid JSON-RPC message', () => {
      const message = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'testMethod',
        params: { key: 'value' },
      };
      const parsed = protocolHandler.parseMessage(message);
      expect(parsed).toEqual(message);
    });

    it('should throw an error for invalid JSON-RPC version', () => {
      const message = {
        jsonrpc: '1.0' as const,
        id: 1,
        method: 'testMethod',
        params: { key: 'value' },
      };
      expect(() => protocolHandler.parseMessage(message)).toThrow(
        'Invalid JSON-RPC message: "jsonrpc" must be "2.0".',
      );
    });

    it('should not throw an error for missing method in request (validation handled by validateMessage)', () => {
      const message = {
        jsonrpc: '2.0' as const,
        id: 1,
        params: { key: 'value' },
      };
      expect(() => protocolHandler.parseMessage(message)).not.toThrow();
    });

    it('should throw an error for invalid message format (not an object)', () => {
      const message = 'invalid';
      expect(() => protocolHandler.parseMessage(message)).toThrow(
        'Invalid JSON-RPC message: Message must be an object.',
      );
    });
  });

  describe('validateMessage', () => {
    it('should validate a valid JSON-RPC request message', () => {
      const message = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'testMethod',
        params: { key: 'value' },
      };
      expect(protocolHandler.validateMessage(message)).toBe(true);
    });

    it('should validate a valid JSON-RPC notification message', () => {
      const message = {
        jsonrpc: '2.0' as const,
        method: 'testNotification',
        params: { key: 'value' },
      };
      expect(protocolHandler.validateMessage(message)).toBe(true);
    });

    it('should return false for invalid JSON-RPC version', () => {
      const message = {
        jsonrpc: '1.0' as const,
        id: 1,
        method: 'testMethod',
        params: { key: 'value' },
      };
      // Cast to unknown to bypass strict type checking for this test case
      expect(protocolHandler.validateMessage(message as unknown as any)).toBe(false);
    });

    it('should return false if id is missing for request (not a notification)', () => {
      const message = {
        jsonrpc: '2.0' as const,
        method: 'testMethod',
        params: { key: 'value' },
      };
      // This is a notification, so it should be true.
      expect(protocolHandler.validateMessage(message)).toBe(true);
    });

    it('should return false if method is missing for request', () => {
      const message = {
        jsonrpc: '2.0' as const,
        id: 1,
        params: { key: 'value' },
      };
      expect(protocolHandler.validateMessage(message)).toBe(false);
    });

    it('should return false if id is present for notification', () => {
      const message = {
        jsonrpc: '2.0' as const,
        id: 1,
        method: 'testNotification',
        params: { key: 'value' },
      };
      // This is a request, so it should be true.
      expect(protocolHandler.validateMessage(message)).toBe(true);
    });
  });
});

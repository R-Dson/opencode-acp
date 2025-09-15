import { Logger } from '../utils/logger.js';

// Define JSON-RPC 2.0 interfaces locally
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: unknown;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

// Define a union type for all possible JSON-RPC messages
export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export class ProtocolHandler {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
    this.logger.info('ProtocolHandler initialized.');
  }

  parseMessage(message: unknown): JsonRpcMessage {
    if (typeof message !== 'object' || message === null) {
      throw new Error('Invalid JSON-RPC message: Message must be an object.');
    }

    // Type guard for message to be a record for property access
    const msg = message as Record<string, unknown>;

    // Check if this is the simplified format: { sessionId, prompt }
    if (msg.sessionId && msg.prompt && msg.jsonrpc === undefined) {
      // Convert simplified format to proper JSON-RPC format
      return {
        jsonrpc: '2.0',
        id: Date.now(), // Generate a simple ID
        method: 'session/prompt',
        params: {
          sessionId: msg.sessionId,
          prompt: msg.prompt,
        },
      } as JsonRpcRequest; // Cast to JsonRpcRequest
    }

    // Support simplified format for session creation
    if (msg.newSession === true && msg.jsonrpc === undefined) {
      // Convert simplified format to proper JSON-RPC format for session creation
      return {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'session/new',
        params: {},
      } as JsonRpcRequest; // Cast to JsonRpcRequest
    }

    // Validate standard JSON-RPC 2.0 format
    if (msg.jsonrpc !== '2.0') {
      throw new Error('Invalid JSON-RPC message: "jsonrpc" must be "2.0".');
    }

    // No further structural validation in parseMessage.
    // This will be handled by validateMessage.
    return msg as unknown as JsonRpcMessage;
  }

  validateMessage(message: JsonRpcMessage): boolean {
    try {
      // Check for JSON-RPC version
      if (message.jsonrpc !== '2.0') {
        this.logger.warn('Validation failed: "jsonrpc" must be "2.0".', message);
        return false;
      }

      // Determine message type based on JSON-RPC 2.0 specification
      const isRequest = 'method' in message && 'id' in message && message.id !== undefined;
      const isNotification = 'method' in message && !('id' in message);
      const isResponse = !('method' in message);

      if (isRequest || isNotification) {
        // This is either a Request or Notification
        const msg = message as JsonRpcRequest | JsonRpcNotification;
        if (typeof msg.method !== 'string') {
          this.logger.warn('Validation failed: "method" must be a string.', msg);
          return false;
        }

        if (isRequest) {
          // This is a Request (has both method and id)
          const request = message as JsonRpcRequest;
          if (
            request.id === null ||
            (typeof request.id !== 'string' && typeof request.id !== 'number')
          ) {
            this.logger.warn(
              'Validation failed: Request "id" must be a string, number, or null.',
              request,
            );
            return false;
          }
        } else {
          // This is a Notification (has method but no id)
          // Valid as per JSON-RPC 2.0
        }
      } else if (isResponse) {
        // This is a Response (no method)
        const response = message as JsonRpcResponse;
        if (!('id' in response)) {
          this.logger.warn('Validation failed: Response must have an "id".', response);
          return false;
        }

        // Response must have either result or error, but not both
        if ((response.result !== undefined && response.error !== undefined) || (response.result === undefined && response.error === undefined)) {
          this.logger.warn(
            'Validation failed: Response must have either "result" or "error", but not both.',
            response,
          );
          return false;
        }
      } else {
        this.logger.warn('Validation failed: Message does not conform to JSON-RPC 2.0 spec.', message);
        return false;
      }

      return true;
    } catch (error: unknown) {
      this.logger.warn(`Validation failed: ${error instanceof Error ? error.message : String(error)}`, message);
      return false;
    }
  }
}

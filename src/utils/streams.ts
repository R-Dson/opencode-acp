import { Readable, Writable } from 'node:stream';
import { ProtocolHandler } from '../agent/protocol-handler.js';
import { Logger } from './logger.js';

export function nodeToWebReadable(nodeStream: Readable): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      nodeStream.on('data', (chunk) => {
        controller.enqueue(chunk);
      });
      nodeStream.on('end', () => {
        controller.close();
      });
      nodeStream.on('error', (err) => {
        controller.error(err);
      });
    },
    cancel(reason) {
      nodeStream.destroy(reason instanceof Error ? reason : new Error(String(reason)));
    },
  });
}

export function nodeToWebWritable(nodeStream: Writable): WritableStream<Uint8Array> {
  return new WritableStream({
    write(chunk) {
      return new Promise((resolve, reject) => {
        nodeStream.write(chunk, (err) => {
          if (err) {
            reject(err);
          } else {
            resolve();
          }
        });
      });
    },
    close() {
      return new Promise((resolve) => {
        nodeStream.end(resolve);
      });
    },
    abort(err) {
      nodeStream.destroy(err);
    },
  });
}

export function createPreprocessedInputStream(
  protocolHandler: ProtocolHandler,
  logger: Logger,
): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform: (chunk, controller) => {
      try {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmedLine = line.trim();
          if (trimmedLine) {
            let message;
            try {
              message = JSON.parse(trimmedLine);
            } catch (e) {
              try {
                const simplified = eval(`(${trimmedLine})`);
                message = simplified;
              } catch (evalError) {
                logger.error(`Failed to parse simplified input: ${trimmedLine}`, evalError);
                continue;
              }
            }
            const processedMessage = protocolHandler.parseMessage(message);
            const processedLine = JSON.stringify(processedMessage) + '\n';
            controller.enqueue(encoder.encode(processedLine));
          }
        }
      } catch (error) {
        logger.error('Error in input stream preprocessing:', error);
        controller.enqueue(chunk);
      }
    },
    flush: (controller) => {
      if (buffer.trim()) {
        try {
          const message = JSON.parse(buffer.trim());
          const processedMessage = protocolHandler.parseMessage(message);
          const processedLine = JSON.stringify(processedMessage) + '\n';
          controller.enqueue(encoder.encode(processedLine));
        } catch (parseError) {
          controller.enqueue(encoder.encode(buffer + '\n'));
        }
      }
      controller.terminate();
    },
  });

  const stdinWebStream = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
  return stdinWebStream.pipeThrough(transformStream);
}

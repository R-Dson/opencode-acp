import { describe, it, expect, vi } from 'vitest';
import { nodeToWebReadable, nodeToWebWritable } from '../../src/utils/streams.js';
import { Readable, Writable } from 'node:stream';

describe('nodeToWebReadable', () => {
  it('should convert a Node.js Readable to a Web ReadableStream', async () => {
    const nodeReadable = new Readable({
      read() {
        this.push('hello');
        this.push('world');
        this.push(null); // No more data
      },
    });

    const webReadable = nodeToWebReadable(nodeReadable);
    const reader = webReadable.getReader();
    const receivedChunks: string[] = [];

    let result;
    while (!(result = await reader.read()).done) {
      receivedChunks.push(new TextDecoder().decode(result.value));
    }

    expect(receivedChunks).toEqual(['hello', 'world']);
  });

  it('should handle errors from Node.js Readable', async () => {
    const nodeReadable = new Readable({
      read() {
        this.emit('error', new Error('Test error'));
      },
    });

    const webReadable = nodeToWebReadable(nodeReadable);
    const reader = webReadable.getReader();

    await expect(reader.read()).rejects.toThrow('Test error');
  });

  it('should handle cancellation of Web ReadableStream', async () => {
    const nodeReadable = new Readable({
      read() {
        /* Simulate a never-ending stream */
      },
    });
    // Readable streams don't have the same unhandled error issue on destroy.
    const spyDestroy = vi.spyOn(nodeReadable, 'destroy');

    const webReadable = nodeToWebReadable(nodeReadable);
    const reader = webReadable.getReader();

    // Cancelling the web stream should destroy the node stream.
    await reader.cancel('Cancelled by test');

    expect(spyDestroy).toHaveBeenCalledWith(new Error('Cancelled by test'));
  });
});

describe('nodeToWebWritable', () => {
  it('should convert a Node.js Writable to a Web WritableStream', async () => {
    const receivedChunks: Uint8Array[] = [];
    const nodeWritable = new Writable({
      write(chunk, encoding, callback) {
        receivedChunks.push(chunk);
        callback();
      },
    });
    const spyEnd = vi.spyOn(nodeWritable, 'end');

    const webWritable = nodeToWebWritable(nodeWritable);
    const writer = webWritable.getWriter();
    const encoder = new TextEncoder();

    await writer.write(encoder.encode('hello'));
    await writer.write(encoder.encode('world'));
    await writer.close();

    expect(new TextDecoder().decode(receivedChunks[0])).toEqual('hello');
    expect(new TextDecoder().decode(receivedChunks[1])).toEqual('world');
    expect(spyEnd).toHaveBeenCalledTimes(1);
  });

  it('should handle errors from Node.js Writable', async () => {
    const nodeWritable = new Writable({
      write(chunk, encoding, callback) {
        callback(new Error('Write error'));
      },
    });

    // --- START OF FIX ---
    // Add a no-op error listener to prevent the unhandled exception warning.
    nodeWritable.on('error', () => {});
    // --- END OF FIX ---

    const webWritable = nodeToWebWritable(nodeWritable);
    const writer = webWritable.getWriter();
    const encoder = new TextEncoder();

    // This correctly tests that the write promise rejects.
    await expect(writer.write(encoder.encode('data'))).rejects.toThrow('Write error');
  });

  it('should handle abort of Web WritableStream', async () => {
    const nodeWritable = new Writable({
      write(chunk, encoding, callback) {
        setTimeout(() => callback(), 100);
      },
    });
    const spyDestroy = vi.spyOn(nodeWritable, 'destroy');

    // --- START OF FIX ---
    // Add a no-op error listener to handle the error emitted when the stream is destroyed.
    nodeWritable.on('error', () => {});
    // --- END OF FIX ---

    const webWritable = nodeToWebWritable(nodeWritable);
    const writer = webWritable.getWriter();
    const encoder = new TextEncoder();

    // The abort call will cause the write() promise to reject.
    // We await the abort() promise itself to ensure the action has completed.
    const writePromise = writer.write(encoder.encode('data'));
    await writer.abort(new Error('Aborted by test'));

    // We can now assert that the write promise rejected due to the abort.
    await expect(writePromise).rejects.toThrow('Aborted by test');

    // And verify the underlying stream was destroyed with the correct reason.
    expect(spyDestroy).toHaveBeenCalledWith(new Error('Aborted by test'));
  });
});

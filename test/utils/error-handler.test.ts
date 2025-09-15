import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorHandler } from '../../src/utils/error-handler.js';
import { Logger } from '../../src/utils/logger.js';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;
  let logger: Logger;
  let loggerErrorSpy: any;
  let loggerWarnSpy: any;

  beforeEach(() => {
    // Create a logger instance
    logger = new Logger();
    errorHandler = new ErrorHandler(logger);

    // Mock the logger methods that our ErrorHandler actually uses.
    loggerErrorSpy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    loggerWarnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('should log a generic Error as an error message', () => {
    const error = new Error('Something went wrong');
    errorHandler.handleError(error);

    // Assert that the 'error' spy was called with the correct prefixed message.
    expect(loggerErrorSpy).toHaveBeenCalledWith(`Error: ${error.message}`, error);
    // Ensure the 'warn' spy was not called.
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });

  it('should log a string-based error as an error message', () => {
    const errorMessage = 'Critical issue!';
    const error = new Error(errorMessage);
    errorHandler.handleError(error);

    // Assert that the 'error' spy was called with the correct prefixed message.
    expect(loggerErrorSpy).toHaveBeenCalledWith(`Error: ${errorMessage}`, error);
  });

  it('should handle and log an unknown error type gracefully', () => {
    const unknownError = 'This is not an Error object';
    errorHandler.handleError(new Error(unknownError));

    // Assert that the 'error' spy was called with a generic message for unknown errors.
    expect(loggerErrorSpy).toHaveBeenCalledWith(`Error: ${unknownError}`, expect.any(Error));
    // Ensure the 'warn' spy was not called.
    expect(loggerWarnSpy).not.toHaveBeenCalled();
  });
});

import { Logger } from './logger.js';

export class ErrorHandler {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  handleError(error: Error, context?: string) {
    this.logger.error(`Error: ${context ? context + ': ' : ''}${error.message}`, error);
    // TODO: Implement more sophisticated error handling, e.g., send to monitoring service
  }
}

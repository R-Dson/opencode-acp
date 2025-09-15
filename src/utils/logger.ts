import winston from 'winston';

export class Logger {
  private logger: winston.Logger;

  constructor() {
    this.logger = winston.createLogger({
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
      transports: [
        new winston.transports.Console(),
        //new winston.transports.File({ filename: 'agent.log' }),
      ],
    });
  }

  info(message: string, ...meta: any[]) {
    this.logger.info(message, ...meta);
  }

  warn(message: string, ...meta: any[]) {
    this.logger.warn(message, ...meta);
  }

  error(message: string, ...meta: any[]) {
    this.logger.error(message, ...meta);
  }

  debug(message: string, ...meta: any[]) {
    this.logger.debug(message, ...meta);
  }
}

export function outputToMarkdown(output: {
  output: string;
  exitStatus?:
    | { exitCode?: number | null | undefined; signal?: string | null | undefined }
    | null
    | undefined;
  truncated: boolean;
}): string {
  let result = '';
  if (output.exitStatus) {
    if (output.exitStatus.exitCode !== undefined && output.exitStatus.exitCode !== null) {
      result += `Exited with code: ${output.exitStatus.exitCode}\n`;
    }
    if (output.exitStatus.signal) {
      result += `Terminated by signal: ${output.exitStatus.signal}\n`;
    }
  }
  result += `Output:\n\`\`\`\n${output.output}\n\`\`\`\n`;
  if (output.truncated) {
    result += `(Output truncated)\n`;
  }
  return result;
}

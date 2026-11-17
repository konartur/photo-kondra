import { ConsoleLogger, type LogLevel } from '@nestjs/common';

export function createApplicationLogger(): ConsoleLogger {
  return new ConsoleLogger({ json: true, colors: false, logLevels: loggingLevels() });
}

export function loggingLevels(level = process.env.LOG_LEVEL ?? 'info'): LogLevel[] {
  const levels: Record<string, LogLevel[]> = {
    debug: ['debug', 'log', 'warn', 'error', 'fatal'],
    info: ['log', 'warn', 'error', 'fatal'],
    warn: ['warn', 'error', 'fatal'],
    error: ['error', 'fatal'],
  };
  if (!Object.hasOwn(levels, level))
    throw new Error('LOG_LEVEL must be debug, info, warn or error');
  return levels[level];
}

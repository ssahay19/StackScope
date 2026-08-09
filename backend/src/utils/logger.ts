import pino from 'pino';
import { env } from '../config/env.js';

/**
 * Root structured logger. Sub-loggers should be created with `.child({...})`
 * so each log line automatically carries context like requestId or service name.
 */
export const logger = pino({
  level: env.logLevel,
  base: { app: 'stackscope-backend' },
  transport:
    env.nodeEnv === 'development'
      ? {
          target: 'pino/file',
          options: { destination: 1 },
        }
      : undefined,
});

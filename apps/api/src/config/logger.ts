import pino from 'pino';
import { env, isProd, isTest } from './env';

export const logger = pino({
  level: isTest ? 'silent' : isProd ? 'info' : 'debug',
  redact: ['req.headers.cookie', 'req.headers.authorization', '*.password', '*.passwordHash', '*.token'],
  transport: env.NODE_ENV === 'development' ? { target: 'pino-pretty' } : undefined,
});

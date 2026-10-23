import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { env, isProd, isTest } from './config/env';
import { logger } from './config/logger';
import { buildOpenApi } from './docs/openapi';
import { csrfGuard } from './middleware/auth';
import { errorHandler, notFoundHandler } from './middleware/error';
import { sanitize } from './middleware/validate';
import { router as auth } from './routes/auth';
import { router as users } from './routes/users';
import { router as academics } from './routes/academics';
import { router as attendance } from './routes/attendance';
import { router as timetable } from './routes/timetable';
import { router as learning } from './routes/learning';
import { router as files } from './routes/files';
import { router as results } from './routes/results';
import { router as notices } from './routes/notices';
import { router as placement } from './routes/placement';
import { router as system } from './routes/system';
import { router as search } from './routes/search';
import { router as analytics } from './routes/analytics';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (isProd) app.set('trust proxy', 1);

  app.use(helmet({ contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:'] } }, crossOriginResourcePolicy: { policy: 'same-site' } }));
  const origins = env.CLIENT_ORIGIN.split(',').map((s) => s.trim());
  app.use(cors({ origin: origins, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'], allowedHeaders: ['Content-Type', 'X-Requested-With', 'Authorization'] }));
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => logger.info({ method: req.method, path: req.originalUrl.split('?')[0], status: res.statusCode, ms: Date.now() - start }, 'request'));
    next();
  });
  app.use('/api', rateLimit({ windowMs: 15 * 60_000, limit: 1500, standardHeaders: true, legacyHeaders: false, skip: () => isTest }));

  // Swagger UI needs inline scripts; mount it before the strict-CSP helmet would apply by relaxing only for this path.
app.use(
  '/api/docs',
  (req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('Content-Security-Policy');
    next();
  },
  swaggerUi.serve,
  (req: Request, res: Response, next: NextFunction) =>
    swaggerUi.setup(buildOpenApi())(req, res, next),
);
  app.get('/api/openapi.json', (_req, res) => res.json(buildOpenApi()));

  app.use('/api/v1', sanitize, csrfGuard);
  for (const r of [system, auth, users, academics, attendance, timetable, learning, files, results, notices, placement, search, analytics]) app.use('/api/v1', r);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}

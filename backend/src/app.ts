import express, { type Express, type Request } from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import apiRouter from './routes/index.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { requestIdMiddleware } from './middleware/requestId.js';
import { logger } from './utils/logger.js';

/**
 * Express app assembly.
 *
 * Order matters here:
 *   1. request-id first, so every subsequent log line carries it
 *   2. structured HTTP logger
 *   3. CORS + JSON body parser
 *   4. routes
 *   5. 404
 *   6. error handler last
 */

export const createApp = (): Express => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(requestIdMiddleware);

  app.use(
    pinoHttp({
      logger,
      customProps: (req) => ({ requestId: (req as Request).requestId }),
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  );

  app.use(
    cors({
      origin: env.frontendOrigin,
      methods: ['GET', 'POST'],
      credentials: false,
    }),
  );

  app.use(express.json({ limit: '16kb' }));

  app.use('/api', apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};

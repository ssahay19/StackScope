import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Attaches a stable UUID to every request as `req.requestId` and echoes it
 * as `X-Request-Id` on the response. Downstream code (routes, error handler,
 * pino-http) uses this for correlation.
 */

declare module 'express-serve-static-core' {
  interface Request {
    requestId?: string;
  }
}

export const requestIdMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  const incoming = req.header('x-request-id');
  const id = incoming && /^[a-zA-Z0-9-]{6,64}$/.test(incoming) ? incoming : randomUUID();
  req.requestId = id;
  res.setHeader('X-Request-Id', id);
  next();
};

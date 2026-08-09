import type { NextFunction, Request, Response } from 'express';
import { isAppError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { ApiErrorBody } from '../types/repository.js';

/**
 * Uniform error middleware.
 *
 * - Known `AppError` instances → status + code from the error itself.
 * - Everything else            → 500 INTERNAL_ERROR with a generic message.
 *
 * We never send stack traces or raw error messages to clients.
 */

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const requestId = req.requestId;

  if (isAppError(err)) {
    const body: ApiErrorBody = {
      error: { code: err.code, message: err.publicMessage },
    };
    logger.warn({ requestId, code: err.code, status: err.status, msg: err.publicMessage }, 'request failed');
    res.status(err.status).json(body);
    return;
  }

  logger.error(
    { requestId, err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err },
    'unhandled error',
  );

  const body: ApiErrorBody = {
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong analyzing this repository.',
    },
  };
  res.status(500).json(body);
};

export const notFoundHandler = (_req: Request, res: Response): void => {
  const body: ApiErrorBody = {
    error: { code: 'NOT_FOUND', message: 'Route not found.' },
  };
  res.status(404).json(body);
};

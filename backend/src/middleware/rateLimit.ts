import rateLimit from 'express-rate-limit';
import type { ApiErrorBody } from '../types/repository.js';

/**
 * Rate limiter for the analyze endpoint.
 *
 * Phase 1 is single-node and unauthenticated, so per-IP limiting is enough.
 * The response shape matches the uniform API error contract so the frontend
 * can render 429s the same way as any other error.
 */

const rateLimitedBody: ApiErrorBody = {
  error: {
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please wait a moment and try again.',
  },
};

export const analyzeRateLimiter = rateLimit({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rateLimitedBody,
});

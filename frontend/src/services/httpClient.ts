import type { ApiError } from '../types/repository';

/**
 * Minimal fetch wrapper.
 *
 * - Serializes JSON in and out.
 * - Extracts the uniform `{ error: { code, message } }` shape into a typed
 *   `HttpError` so hooks can `catch (e) { if (e instanceof HttpError) ... }`.
 * - Falls back to a generic error when the server returns something unexpected
 *   (e.g. a proxy 502 with HTML).
 */

const API_BASE_URL: string =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:3001/api';

export class HttpError extends Error {
  public readonly code: string;
  public readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  signal?: AbortSignal;
}

export const getJson = async <T>(path: string, opts: RequestOptions = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new HttpError(0, 'NETWORK_ERROR', 'Could not reach the StackScope API.');
  }

  if (!response.ok) {
    const parsed = await safeParseError(response);
    throw new HttpError(response.status, parsed.code, parsed.message);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new HttpError(response.status, 'INVALID_RESPONSE', 'Received a malformed response from the server.');
  }
};

export const postJson = async <T>(path: string, body: unknown, opts: RequestOptions = {}): Promise<T> => {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new HttpError(0, 'NETWORK_ERROR', 'Could not reach the StackScope API. Is the backend running?');
  }

  if (!response.ok) {
    const parsed = await safeParseError(response);
    throw new HttpError(response.status, parsed.code, parsed.message);
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new HttpError(response.status, 'INVALID_RESPONSE', 'Received a malformed response from the server.');
  }
};

const safeParseError = async (res: Response): Promise<ApiError> => {
  try {
    const body = (await res.json()) as { error?: Partial<ApiError> };
    const code = typeof body.error?.code === 'string' ? body.error.code : 'INTERNAL_ERROR';
    const message =
      typeof body.error?.message === 'string' && body.error.message.length > 0
        ? body.error.message
        : 'Something went wrong.';
    return { code, message };
  } catch {
    return { code: 'INTERNAL_ERROR', message: `Request failed with status ${res.status}.` };
  }
};

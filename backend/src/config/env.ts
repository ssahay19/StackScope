/**
 * Typed environment loader.
 *
 * Reads process.env exactly once at startup and exposes a strongly-typed
 * `env` object. All limits and network settings the backend cares about
 * live here so services never touch process.env directly.
 */

const readString = (key: string, fallback: string): string => {
  const raw = process.env[key];
  return raw && raw.length > 0 ? raw : fallback;
};

const readInt = (key: string, fallback: number): number => {
  const raw = process.env[key];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed) || parsed <= 0) return fallback;
  return parsed;
};

export interface AppEnv {
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  frontendOrigin: string;
  logLevel: string;

  gitCloneTimeoutMs: number;
  maxScanEntries: number;
  maxScanDepth: number;
  maxScanTimeMs: number;

  // Phase 2 parsing budgets.
  parseConcurrency: number;
  maxParseFileBytes: number;
  maxParseTimeMs: number;

  // Analysis store (Phase 4 — now SQLite-backed).
  analysisTtlMs: number;
  analysisMaxEntries: number;
  analysisDbPath: string;
}

const rawNodeEnv = readString('NODE_ENV', 'development');
const nodeEnv: AppEnv['nodeEnv'] =
  rawNodeEnv === 'production' || rawNodeEnv === 'test' ? rawNodeEnv : 'development';

export const env: AppEnv = {
  nodeEnv,
  port: readInt('PORT', 3001),
  frontendOrigin: readString('FRONTEND_ORIGIN', 'http://localhost:5173'),
  logLevel: readString('LOG_LEVEL', 'info'),

  gitCloneTimeoutMs: readInt('GIT_CLONE_TIMEOUT_MS', 30_000),
  maxScanEntries: readInt('MAX_SCAN_ENTRIES', 15_000),
  maxScanDepth: readInt('MAX_SCAN_DEPTH', 20),
  maxScanTimeMs: readInt('MAX_SCAN_TIME_MS', 20_000),

  parseConcurrency: readInt('PARSE_CONCURRENCY', 8),
  maxParseFileBytes: readInt('MAX_PARSE_FILE_BYTES', 500_000),
  maxParseTimeMs: readInt('MAX_PARSE_TIME_MS', 30_000),

  analysisTtlMs: readInt('ANALYSIS_TTL_MS', 30 * 60_000),
  analysisMaxEntries: readInt('ANALYSIS_MAX_ENTRIES', 50),
  // Set to `:memory:` for ephemeral runs (tests use this). Relative paths are
  // resolved from the backend's current working directory at startup.
  analysisDbPath: readString('ANALYSIS_DB_PATH', 'data/analyses.db'),
};

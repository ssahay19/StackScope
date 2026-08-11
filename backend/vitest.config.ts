import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: false,
    reporters: 'default',
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // Vitest 4: single worker, no isolation — avoids cold-worker timeouts with
    // native addons (better-sqlite3, tree-sitter).
    maxWorkers: 1,
    isolate: false,
    fileParallelism: false,
    // Force the process-wide analysis store onto an in-memory SQLite DB so
    // route tests and any incidental imports never touch the on-disk file.
    env: {
      ANALYSIS_DB_PATH: ':memory:',
      ANALYSIS_TTL_MS: '60000',
      ANALYSIS_MAX_ENTRIES: '50',
    },
  },
});

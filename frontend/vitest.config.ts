import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: false,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    testTimeout: 15_000,
    hookTimeout: 30_000,
    // Vitest 4: single worker, no isolation — avoids cold-worker timeouts.
    maxWorkers: 1,
    isolate: false,
    fileParallelism: false,
  },
});

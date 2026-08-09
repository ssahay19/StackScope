import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Thin wrappers over `fs.promises` for temp directory lifecycle.
 * Centralized so future caching or worker-pool changes only touch this file.
 */

const TEMP_PREFIX = 'stackscope-';

export const createTempDir = async (): Promise<string> => {
  return mkdtemp(join(tmpdir(), TEMP_PREFIX));
};

export const removeDir = async (dir: string): Promise<void> => {
  // `force: true` swallows ENOENT so cleanup is idempotent.
  await rm(dir, { recursive: true, force: true, maxRetries: 3 });
};

import { simpleGit, type SimpleGit } from 'simple-git';
import { env } from '../config/env.js';
import { CloneFailedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';

/**
 * Git service — the only place that talks to `simple-git`.
 *
 * Always clones with:
 *   --depth 1  (no history)
 *   --single-branch (default branch only)
 *   no submodules
 *
 * A wall-clock timeout aborts the clone so a hung or malicious remote
 * cannot pin the request forever. All errors are normalized into
 * `CloneFailedError` — raw git stderr never reaches the client.
 */

const log = logger.child({ service: 'gitService' });

export interface CloneOptions {
  cloneUrl: string;
  destDir: string;
  timeoutMs?: number;
}

const runWithTimeout = async <T>(promise: Promise<T>, timeoutMs: number, onTimeout: () => void): Promise<T> => {
  let timeoutHandle: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutHandle = setTimeout(() => {
      onTimeout();
      reject(new CloneFailedError('Clone timed out. The repository may be too large or the network is slow.'));
    }, timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) clearTimeout(timeoutHandle);
  }
};

export const cloneRepository = async ({
  cloneUrl,
  destDir,
  timeoutMs = env.gitCloneTimeoutMs,
}: CloneOptions): Promise<void> => {
  // Interactive prompts are suppressed exclusively via env vars below;
  // simple-git blocks setting core.askPass via `config` for safety.
  const git: SimpleGit = simpleGit({ baseDir: destDir });

  const cloneArgs = ['--depth', '1', '--single-branch', '--no-tags', '--filter=blob:none'];

  log.info({ cloneUrl }, 'cloning repository');

  try {
    // GIT_TERMINAL_PROMPT=0 stops git from asking for credentials interactively.
    // simple-git forbids GIT_ASKPASS unless allowUnsafeAskPass is set, which we
    // deliberately do not enable — a private repo simply results in CLONE_FAILED.
    await runWithTimeout(
      git.env('GIT_TERMINAL_PROMPT', '0').clone(cloneUrl, destDir, cloneArgs),
      timeoutMs,
      () => log.warn({ cloneUrl }, 'clone timed out; aborting'),
    );
  } catch (err) {
    if (err instanceof CloneFailedError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    log.warn({ err: message }, 'git clone failed');

    // Produce a slightly more helpful public message for the common cases,
    // without leaking git's own output.
    let publicMessage = 'Failed to clone the repository. It may be private or unavailable.';
    const lower = message.toLowerCase();
    if (lower.includes('repository not found') || lower.includes('not found')) {
      publicMessage = 'Repository not found. Check that the URL is correct and the repository is public.';
    } else if (lower.includes('authentication') || lower.includes('could not read') || lower.includes('403')) {
      publicMessage = 'Repository is private or requires authentication.';
    }
    throw new CloneFailedError(publicMessage, err);
  }
};

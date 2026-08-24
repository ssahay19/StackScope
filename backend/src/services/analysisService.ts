import { cloneRepository } from './gitService.js';
import { scanRepository } from './repoScannerService.js';
import { runParsingPipeline } from './parser/parsingPipeline.js';
import { AnalysisStore, type StoredAnalysis } from './analysisStore.js';
import { readReadmeExcerpt } from './readmeExcerpt.js';
import { createTempDir, removeDir } from '../utils/fileSystem.js';
import { parseGithubRepoUrl } from '../utils/githubUrl.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';
import type { RepositoryAnalysis } from '../types/repository.js';

/**
 * Analyze orchestrator.
 *
 * Pipeline:
 *   1. validate + parse the URL
 *   2. create temp directory
 *   3. clone the repository                   (Phase 1)
 *   4. scan the working tree                  (Phase 1, unchanged)
 *   5. run the parsing pipeline               (Phase 2)
 *   6. optionally capture a short README excerpt (Phase 6 prompt input)
 *   7. store the result in the analysisStore  (Phase 4 — SQLite-backed)
 *   8. cleanup temp dir in `finally`
 *
 * AI generation is never invoked here — summaries are opt-in via
 * GET /api/repository/:id/summary.
 */

const log = logger.child({ service: 'analysisService' });

// Single process-wide store instance. Phase 4: SQLite-backed.
export const analysisStore = new AnalysisStore({
  dbPath: env.analysisDbPath,
  ttlMs: env.analysisTtlMs,
  maxEntries: env.analysisMaxEntries,
});

export const analyzeRepository = async (repoUrl: unknown): Promise<RepositoryAnalysis> => {
  const parsed = parseGithubRepoUrl(repoUrl);
  const tempDir = await createTempDir();
  log.info({ owner: parsed.owner, repo: parsed.repo, tempDir }, 'analysis started');

  try {
    await cloneRepository({ cloneUrl: parsed.cloneUrl, destDir: tempDir });

    const scan = await scanRepository({
      clonedRoot: tempDir,
      owner: parsed.owner,
      repo: parsed.repo,
    });

    const { graph, summary } = await runParsingPipeline({
      clonedRoot: tempDir,
      tree: scan.tree,
    });

    const readmeExcerpt = await readReadmeExcerpt(tempDir);

    // `id` is added by the store; we hand it a "not-yet-id'd" object.
    const withoutId: Omit<RepositoryAnalysis, 'id'> = {
      ...scan,
      dependencySummary: summary,
    };
    const record: StoredAnalysis = analysisStore.put({
      analysis: withoutId,
      graph,
      readmeExcerpt,
    });
    return record.analysis;
  } finally {
    try {
      await removeDir(tempDir);
    } catch (err) {
      log.warn(
        { err: err instanceof Error ? err.message : String(err), tempDir },
        'temp cleanup failed',
      );
    }
  }
};

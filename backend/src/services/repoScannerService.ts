import { readdir, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { env } from '../config/env.js';
import { RepoTooLargeError, ScanFailedError } from '../utils/errors.js';
import { logger } from '../utils/logger.js';
import type { LanguageStat, RepositoryScan, TreeNode } from '../types/repository.js';
import { extractExtension, fileCategoryOf, sourceLanguageOf } from './languageDetection.js';

/**
 * Repository scanner.
 *
 * Walks the cloned working tree once and produces the full DTO. Enforces
 * three independent safety budgets:
 *   - MAX_SCAN_DEPTH    (recursion depth)
 *   - MAX_SCAN_ENTRIES  (total files + folders visited)
 *   - MAX_SCAN_TIME_MS  (wall-clock)
 * Any budget breach throws REPO_TOO_LARGE.
 *
 * The scanner never opens file contents — it only reads directory entries
 * and `stat`s files. This keeps Phase 1 fast and side-effect-free.
 */

const log = logger.child({ service: 'repoScannerService' });

const IGNORED_DIRECTORIES = new Set<string>([
  '.git',
  'node_modules',
  'dist',
  'build',
  '.next',
  'coverage',
  '.venv',
  'venv',
  '__pycache__',
  'target',
  'vendor',
]);

interface ScanContext {
  root: string;
  startedAt: number;
  entriesVisited: number;
  folderCount: number;
  fileCount: number;
  categoryCounts: Map<string, number>;
  sourceLanguageCounts: Map<string, number>;
}

const budgetCheck = (ctx: ScanContext): void => {
  if (ctx.entriesVisited > env.maxScanEntries) {
    throw new RepoTooLargeError(
      `Repository has more than ${env.maxScanEntries} entries and cannot be scanned in Phase 1.`,
    );
  }
  if (Date.now() - ctx.startedAt > env.maxScanTimeMs) {
    throw new RepoTooLargeError('Repository scan exceeded the time budget. Try a smaller repository.');
  }
};

/** Sort: folders before files, then case-insensitive alphabetical. */
const sortNodes = (nodes: TreeNode[]): TreeNode[] =>
  nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });

const walkDirectory = async (
  absDir: string,
  relDir: string,
  depth: number,
  ctx: ScanContext,
): Promise<TreeNode[]> => {
  if (depth > env.maxScanDepth) {
    throw new RepoTooLargeError(`Repository exceeds max directory depth of ${env.maxScanDepth}.`);
  }

  let entries;
  try {
    entries = await readdir(absDir, { withFileTypes: true });
  } catch (err) {
    throw new ScanFailedError('Failed to read a directory while scanning the repository.', err);
  }

  const nodes: TreeNode[] = [];

  for (const entry of entries) {
    budgetCheck(ctx);
    ctx.entriesVisited += 1;

    const name = entry.name;
    if (name.startsWith('.git') && depth === 0 && name === '.git') continue;
    if (IGNORED_DIRECTORIES.has(name)) continue;
    // Ignore symlinks: we do not follow them to avoid loops or escaping the clone.
    if (entry.isSymbolicLink()) continue;

    const absPath = join(absDir, name);
    const relPath = relDir === '' ? name : posix.join(relDir, name);

    if (entry.isDirectory()) {
      ctx.folderCount += 1;
      const children = await walkDirectory(absPath, relPath, depth + 1, ctx);
      nodes.push({
        name,
        path: relPath,
        type: 'folder',
        children,
      });
    } else if (entry.isFile()) {
      ctx.fileCount += 1;

      let size = 0;
      try {
        const s = await stat(absPath);
        size = s.size;
      } catch {
        // If stat fails, we still record the file with size 0 rather than
        // failing the whole scan. This is intentionally lenient.
      }

      const ext = extractExtension(name);
      const category = fileCategoryOf(ext);
      ctx.categoryCounts.set(category, (ctx.categoryCounts.get(category) ?? 0) + 1);

      const sourceLang = sourceLanguageOf(ext);
      if (sourceLang) {
        ctx.sourceLanguageCounts.set(sourceLang, (ctx.sourceLanguageCounts.get(sourceLang) ?? 0) + 1);
      }

      const node: TreeNode = {
        name,
        path: relPath,
        type: 'file',
        size,
      };
      if (ext) node.extension = ext;
      nodes.push(node);
    }
    // Other entry types (block/char devices, sockets, fifos) are skipped.
  }

  return sortNodes(nodes);
};

const buildLanguageBreakdown = (categoryCounts: Map<string, number>): LanguageStat[] => {
  const total = Array.from(categoryCounts.values()).reduce((sum, n) => sum + n, 0);
  if (total === 0) return [];

  const stats: LanguageStat[] = Array.from(categoryCounts.entries()).map(([name, fileCount]) => ({
    name,
    fileCount,
    percent: Math.round((fileCount / total) * 1000) / 10,
  }));

  stats.sort((a, b) => b.fileCount - a.fileCount || a.name.localeCompare(b.name));
  return stats;
};

const pickPrimaryLanguage = (
  sourceLanguageCounts: Map<string, number>,
  categoryCounts: Map<string, number>,
): string => {
  if (sourceLanguageCounts.size > 0) {
    let best: [string, number] | null = null;
    for (const entry of sourceLanguageCounts) {
      if (!best || entry[1] > best[1]) best = entry;
    }
    if (best) return best[0];
  }
  // Fallback: most common non-source category, or "Unknown" if empty.
  let best: [string, number] | null = null;
  for (const entry of categoryCounts) {
    if (!best || entry[1] > best[1]) best = entry;
  }
  return best ? best[0] : 'Unknown';
};

export interface ScanInput {
  clonedRoot: string;
  owner: string;
  repo: string;
}

export const scanRepository = async ({
  clonedRoot,
  owner,
  repo,
}: ScanInput): Promise<RepositoryScan> => {
  const ctx: ScanContext = {
    root: clonedRoot,
    startedAt: Date.now(),
    entriesVisited: 0,
    folderCount: 0,
    fileCount: 0,
    categoryCounts: new Map(),
    sourceLanguageCounts: new Map(),
  };

  log.info({ owner, repo }, 'scanning repository');

  let children: TreeNode[];
  try {
    children = await walkDirectory(clonedRoot, '', 0, ctx);
  } catch (err) {
    if (err instanceof RepoTooLargeError || err instanceof ScanFailedError) throw err;
    throw new ScanFailedError('Failed to scan the repository.', err);
  }

  const tree: TreeNode = {
    name: repo,
    path: '',
    type: 'folder',
    children,
  };

  const analysis: RepositoryScan = {
    name: repo,
    owner,
    language: pickPrimaryLanguage(ctx.sourceLanguageCounts, ctx.categoryCounts),
    totalFiles: ctx.fileCount,
    totalFolders: ctx.folderCount,
    languages: buildLanguageBreakdown(ctx.categoryCounts),
    tree,
    analyzedAt: new Date().toISOString(),
  };

  log.info(
    { owner, repo, files: ctx.fileCount, folders: ctx.folderCount, entries: ctx.entriesVisited },
    'scan complete',
  );

  return analysis;
};

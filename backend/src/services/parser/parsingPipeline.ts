import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import { mapWithConcurrency } from '../../utils/concurrency.js';
import type {
  DependencyGraph,
  DependencyNode,
  ImportRef,
  SkipReason,
} from '../../types/parsing.js';
import type { TreeNode } from '../../types/repository.js';
import { extractSymbolsAndImports } from './symbolExtractorService.js';
import {
  isSupportedLanguage,
  languageFromExtension,
  displayNameOf,
  parseSource,
} from './parserService.js';
import { createImportResolver } from './importResolver.js';
import { buildDependencyGraph, summarizeGraph } from './dependencyGraphService.js';
import { classifyFile, folderOf } from './nodeClassifier.js';

/**
 * parsingPipeline
 *
 * Orchestrates the Phase 2 steps: gather file list from the scan → parse
 * eligible files in parallel → resolve imports → build the graph. This is
 * the only file that combines all the parser modules; everything else stays
 * single-purpose.
 */

const log = logger.child({ service: 'parsingPipeline' });

// File paths that hint at generated or minified output.
const SKIP_PATH_SUBSTRINGS = ['/dist/', '/build/', '/node_modules/', '/.next/', '/coverage/'];
const MINIFIED_PATTERN = /\.min\.(?:js|mjs|cjs|jsx|ts|tsx)$/i;

const flattenFiles = (tree: TreeNode): TreeNode[] => {
  const files: TreeNode[] = [];
  const walk = (node: TreeNode): void => {
    if (node.type === 'file') {
      files.push(node);
      return;
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(tree);
  return files;
};

const decideSkip = (file: TreeNode): SkipReason | null => {
  const path = file.path;
  const withLeading = `/${path}`;
  if (SKIP_PATH_SUBSTRINGS.some((seg) => withLeading.includes(seg))) return 'ignored-path';
  if (MINIFIED_PATTERN.test(path)) return 'minified';
  if (!isSupportedLanguage(file.extension)) return 'unsupported-language';
  if ((file.size ?? 0) > env.maxParseFileBytes) return 'too-large';
  return null;
};

const readWithFallback = async (absPath: string): Promise<string | null> => {
  try {
    return await readFile(absPath, 'utf8');
  } catch (err) {
    log.warn(
      { path: absPath, err: err instanceof Error ? err.message : String(err) },
      'file read failed',
    );
    return null;
  }
};

export interface RunPipelineInput {
  clonedRoot: string;
  tree: TreeNode;
}

export interface RunPipelineResult {
  graph: DependencyGraph;
  summary: ReturnType<typeof summarizeGraph>;
}

/**
 * The pipeline is bounded in three independent ways:
 *   - a wall-clock timeout on the whole pipeline (env.maxParseTimeMs)
 *   - per-file size cap (env.maxParseFileBytes)
 *   - parallel worker count (env.parseConcurrency)
 * If we exceed the wall-clock we finish with whatever nodes we have — the
 * user gets a partial graph rather than an error.
 */
export const runParsingPipeline = async ({
  clonedRoot,
  tree,
}: RunPipelineInput): Promise<RunPipelineResult> => {
  const startedAt = Date.now();
  const deadline = startedAt + env.maxParseTimeMs;

  const files = flattenFiles(tree);
  const nodePaths = files.map((f) => f.path);
  const resolver = createImportResolver(nodePaths);

  log.info({ fileCount: files.length }, 'parsing pipeline started');

  const nodes = await mapWithConcurrency(
    files,
    env.parseConcurrency,
    async (file): Promise<DependencyNode> => {
      const language = languageFromExtension(file.extension);
      const skipReason = decideSkip(file);

      const extension = file.extension ?? null;
      const baseNode: DependencyNode = {
        filePath: file.path,
        language: language ? displayNameOf(language) : extension?.toUpperCase() ?? 'Unknown',
        languageSupported: language !== null,
        imports: [],
        importedBy: [],
        symbols: [],
        parseError: null,
        skipped: false,
        skipReason: null,
        category: classifyFile(file.path, extension),
        extension,
        folder: folderOf(file.path),
        symbolCount: 0,
      };

      if (skipReason) {
        return { ...baseNode, skipped: true, skipReason };
      }
      if (Date.now() > deadline) {
        return { ...baseNode, skipped: true, skipReason: 'too-large' };
      }

      const absPath = join(clonedRoot, file.path);
      const source = await readWithFallback(absPath);
      if (source === null) {
        return { ...baseNode, skipped: true, skipReason: 'read-error' };
      }

      try {
        const parsed = parseSource(language!, source);
        const extracted = extractSymbolsAndImports(file.path, parsed.rootNode);
        const importsWithResolution: ImportRef[] = extracted.imports.map((imp) => ({
          ...imp,
          resolvedPath: resolver.resolve(file.path, imp.source),
        }));
        return {
          ...baseNode,
          imports: importsWithResolution,
          symbols: extracted.symbols,
          symbolCount: extracted.symbols.length,
          parseError: parsed.hasErrors ? 'Parser encountered syntax errors' : null,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.warn({ file: file.path, err: msg }, 'parse failed');
        return { ...baseNode, parseError: 'Parse failed' };
      }
    },
  );

  const resolvedNodes: DependencyNode[] = nodes.filter((n): n is DependencyNode => n !== undefined);

  const graph = buildDependencyGraph({ nodes: resolvedNodes });

  const filesParsed = resolvedNodes.filter((n) => !n.skipped && n.parseError === null).length;
  const filesSkipped = resolvedNodes.filter((n) => n.skipped).length;
  const filesFailed = resolvedNodes.filter((n) => !n.skipped && n.parseError !== null).length;

  const summary = summarizeGraph({ graph, filesParsed, filesSkipped, filesFailed });

  log.info(
    {
      fileCount: files.length,
      parsed: filesParsed,
      skipped: filesSkipped,
      failed: filesFailed,
      edges: graph.edges.length,
      cycles: summary.circularDependencies,
      elapsedMs: Date.now() - startedAt,
    },
    'parsing pipeline complete',
  );

  return { graph, summary };
};

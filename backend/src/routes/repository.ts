import { Router, type Request, type Response, type NextFunction } from 'express';
import { analysisStore } from '../services/analysisService.js';
import { computeArchitectureInsights } from '../services/architectureInsightsService.js';
import { computeImpact } from '../services/impactService.js';
import { explainFileImpact } from '../services/impactExplainService.js';
import { summarizeRepository } from '../services/summaryService.js';
import { NotFoundError } from '../utils/errors.js';
import type { DependencyNode } from '../types/parsing.js';

/**
 * Read-only repository endpoints.
 *
 *   GET /api/repository/:id
 *   GET /api/repository/:id/dependencies
 *   GET /api/repository/:id/insights
 *   GET /api/repository/:id/summary
 *   GET /api/repository/:id/impact/<filePath>          → change-impact (Phase 7)
 *   GET /api/repository/:id/impact/<filePath>/explain  → AI impact explain (Phase 7)
 *   GET /api/repository/:id/file/<filePath>
 */

const router = Router();

const decodeFilePath = (raw: string): string =>
  decodeURIComponent(raw).replace(/^\/+/, '');

/**
 * Split `/impact/<filePath>` vs `/impact/<filePath>/explain`.
 * The trailing segment `explain` is reserved as the AI suffix.
 */
const parseImpactPath = (
  raw: string,
): { filePath: string; explain: boolean } => {
  const decoded = decodeFilePath(raw);
  if (decoded.endsWith('/explain')) {
    const filePath = decoded.slice(0, -'/explain'.length).replace(/\/+$/, '');
    return { filePath, explain: true };
  }
  return { filePath: decoded, explain: false };
};

router.get('/:id', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const record = analysisStore.get(id);
    res.json(record.analysis);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/dependencies', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const record = analysisStore.get(id);
    res.json({ nodes: record.graph.nodes, edges: record.graph.edges });
  } catch (err) {
    next(err);
  }
});

router.get('/:id/insights', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const record = analysisStore.get(id);
    res.json(computeArchitectureInsights(record.graph));
  } catch (err) {
    next(err);
  }
});

router.get('/:id/summary', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    analysisStore.get(id);
    const result = await summarizeRepository(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/impact/*', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const rawPath = (req.params as Record<string, string>)[0] ?? '';
    const { filePath, explain } = parseImpactPath(rawPath);
    if (filePath.length === 0) {
      throw new NotFoundError('File path is required.');
    }

    const record = analysisStore.get(id);
    const impact = computeImpact(record.graph, filePath);
    if (!impact) throw new NotFoundError('File not found in this repository analysis.');

    if (explain) {
      const result = await explainFileImpact(id, filePath);
      res.json(result);
      return;
    }

    res.json(impact);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/file/*', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    const rawPath = (req.params as Record<string, string>)[0] ?? '';
    const filePath = decodeFilePath(rawPath);
    if (filePath.length === 0) {
      throw new NotFoundError('File path is required.');
    }

    const record = analysisStore.get(id);
    const node: DependencyNode | undefined = record.graph.nodes.find(
      (n) => n.filePath === filePath,
    );
    if (!node) throw new NotFoundError('File not found in this repository analysis.');

    res.json({
      filePath: node.filePath,
      language: node.language,
      languageSupported: node.languageSupported,
      imports: node.imports,
      importedBy: node.importedBy,
      symbols: node.symbols,
      parseError: node.parseError,
      skipped: node.skipped,
      skipReason: node.skipReason,
      category: node.category,
      extension: node.extension,
      folder: node.folder,
      symbolCount: node.symbolCount,
    });
  } catch (err) {
    next(err);
  }
});

export default router;

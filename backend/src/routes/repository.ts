import { Router, type Request, type Response, type NextFunction } from 'express';
import { analysisStore } from '../services/analysisService.js';
import { computeArchitectureInsights } from '../services/architectureInsightsService.js';
import { summarizeRepository } from '../services/summaryService.js';
import { NotFoundError } from '../utils/errors.js';
import type { DependencyNode } from '../types/parsing.js';

/**
 * Read-only repository endpoints.
 *
 *   GET /api/repository/:id                    → the full stored analysis
 *   GET /api/repository/:id/dependencies       → the full graph
 *   GET /api/repository/:id/insights           → architecture insights (Phase 5D)
 *   GET /api/repository/:id/summary            → AI overview (Phase 6, opt-in)
 *   GET /api/repository/:id/file/<filePath>    → a single file's node
 *
 * All five read from the analysis store; each returns 404 if the analysis
 * has expired or was evicted. Summary never runs during analyze.
 */

const router = Router();

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
    // Touch the store first so unknown ids 404 before we talk about AI config.
    analysisStore.get(id);
    const result = await summarizeRepository(id);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get('/:id/file/*', (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params as { id: string };
    // Everything after `/file/` is the file path. Express 4 exposes it as `req.params[0]`.
    // We decode it because clients typically encode `/` slashes.
    const rawPath = (req.params as Record<string, string>)[0] ?? '';
    const filePath = decodeURIComponent(rawPath).replace(/^\/+/, '');
    if (filePath.length === 0) {
      throw new NotFoundError('File path is required.');
    }

    const record = analysisStore.get(id);
    const node: DependencyNode | undefined = record.graph.nodes.find(
      (n) => n.filePath === filePath,
    );
    if (!node) throw new NotFoundError('File not found in this repository analysis.');

    // Return exactly the contract the frontend inspector needs.
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

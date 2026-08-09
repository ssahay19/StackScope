import { Router, type Request, type Response, type NextFunction } from 'express';
import { analysisStore } from '../services/analysisService.js';
import { NotFoundError } from '../utils/errors.js';
import type { DependencyNode } from '../types/parsing.js';

/**
 * Read-only repository endpoints.
 *
 *   GET /api/repository/:id                    → the full stored analysis
 *   GET /api/repository/:id/dependencies       → the full graph
 *   GET /api/repository/:id/file/<filePath>    → a single file's node
 *
 * All three read from the analysis store; each returns 404 if the analysis
 * has expired or was evicted. The `/:id` root endpoint is Phase 4's addition,
 * used by the frontend to reload an analysis on a hard refresh or a shared
 * link.
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

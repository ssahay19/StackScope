import { Router, type Request, type Response, type NextFunction } from 'express';
import { analyzeRepository } from '../services/analysisService.js';
import { analyzeRateLimiter } from '../middleware/rateLimit.js';

const router = Router();

router.post('/', analyzeRateLimiter, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = req.body as { repoUrl?: unknown } | undefined;
    const analysis = await analyzeRepository(body?.repoUrl);
    res.json(analysis);
  } catch (err) {
    next(err);
  }
});

export default router;

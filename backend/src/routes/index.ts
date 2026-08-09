import { Router } from 'express';
import healthRouter from './health.js';
import analyzeRouter from './analyze.js';
import repositoryRouter from './repository.js';

const router = Router();

router.use('/health', healthRouter);
router.use('/analyze', analyzeRouter);
router.use('/repository', repositoryRouter);

export default router;

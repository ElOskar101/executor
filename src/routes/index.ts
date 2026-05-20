import express, { Request, Response } from 'express';

import executionRoute from './execution.route';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Executor API is running'
  });
});

router.get('/api/health', (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

router.use('/api/v1', executionRoute);
router.use('/', executionRoute);
console.info("[SERVER] Routes loaded");
export default router;

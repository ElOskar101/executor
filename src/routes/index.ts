import express, { Request, Response } from 'express';

import commandRoute from './command.routes';
import executionRoute from './execution.route';

const router = express.Router();

router.get('/', (req: Request, res: Response) => {
  res.status(200).json({
    message: 'Executor API is running'
  });
});

router.use('/api/v1', commandRoute);
router.use('/api/v1', executionRoute);
console.info("[SERVER] Routes loaded");
export default router;


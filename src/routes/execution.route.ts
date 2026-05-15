import express from 'express';

import {
    createExecution,
    deleteExecution,
    getExecution,
    getExecutions,
    stopExecution,
    updateExecution
} from '../controllers/execution.controller';

const router = express.Router();

router.post('/executions', createExecution);
router.get('/executions', getExecutions);
router.get('/executions/:id', getExecution);
router.post('/executions/:id/stop', stopExecution);
router.patch('/executions/:id', updateExecution);
router.delete('/executions/:id', deleteExecution);

export default router;

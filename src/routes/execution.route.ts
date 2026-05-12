import express from 'express';

import {runProject, stopExecution} from '../controllers/command.controller';

const router = express.Router();


router.post('/execution/run-project/:project', runProject);
router.post('/execution/stop-project/:serviceId', stopExecution);
//router.post('/commands/show-last-logs/:project', runBot);

export default router;


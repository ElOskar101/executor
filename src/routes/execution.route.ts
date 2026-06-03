import express from 'express';

import {
    createExecution,
    createScheduledExecution,
    deleteExecution,
    getExecution,
    getExecutions,
    pauseExecution,
    runScheduledExecutionNow,
    resumeExecution,
    stopExecution,
    updateExecution
} from '../controllers/execution.controller';

const router = express.Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *           example: Project is required
 *     Bot:
 *       type: object
 *       required: [botName, targetUrl, username, password]
 *       properties:
 *         botName:
 *           type: string
 *           example: eligibility-bot
 *         targetUrl:
 *           type: string
 *           example: https://portal.example.com
 *         username:
 *           type: string
 *           example: runner_user
 *         password:
 *           type: string
 *           example: runner_password
 *         otherInformation:
 *           type: object
 *           additionalProperties: true
 *     Patient:
 *       type: object
 *       required:
 *         - patientName
 *         - patientLastName
 *         - patientMemberId
 *         - patientDob
 *         - policyHolderName
 *         - policyHolderLastName
 *         - policyHolderDob
 *         - relationship
 *         - zipCode
 *         - clinic
 *         - verificationType
 *         - filenames
 *         - otherInformation
 *       properties:
 *         patientName:
 *           type: string
 *         patientLastName:
 *           type: string
 *         patientMemberId:
 *           type: string
 *         patientDob:
 *           type: string
 *           example: 1985-03-10
 *         policyHolderName:
 *           type: string
 *         policyHolderLastName:
 *           type: string
 *         policyHolderDob:
 *           type: string
 *           example: 1985-03-10
 *         relationship:
 *           type: string
 *           example: self
 *         zipCode:
 *           type: string
 *           example: 33101
 *         clinic:
 *           type: string
 *         verificationType:
 *           type: string
 *           enum: [elg, fbd]
 *         filenames:
 *           type: string
 *           example: ana-lopez.pdf
 *         otherInformation:
 *           type: object
 *           additionalProperties: true
 *     CreateExecutionRequest:
 *       type: object
 *       required: [project, meta]
 *       properties:
 *         project:
 *           type: string
 *           example: elg-regression
 *         createdBy:
 *           type: string
 *         client:
 *           type: string
 *         clinic:
 *           type: string
 *         botName:
 *           type: string
 *         execution:
 *           type: string
 *         playwrightMode:
 *           type: string
 *           enum: [serial, default, parallel]
 *         workers:
 *           type: integer
 *           minimum: 1
 *         retries:
 *           type: integer
 *           minimum: 0
 *         headed:
 *           type: boolean
 *         meta:
 *           type: object
 *           required: [bot, patients, config, rv]
 *           properties:
 *             bot:
 *               $ref: '#/components/schemas/Bot'
 *             patients:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Patient'
 *             config:
 *               type: object
 *               additionalProperties: true
 *             rv:
 *               type: object
 *               additionalProperties: true
 *             outputPath:
 *               type: string
 *             logsPath:
 *               type: string
 *             workers:
 *               type: integer
 *               minimum: 1
 *             retries:
 *               type: integer
 *               minimum: 0
 *             headed:
 *               type: boolean
 *             playwrightMode:
 *               type: string
 *               enum: [serial, default, parallel]
 *     Execution:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: 682ba2f2d2930c4fd5e984c4
 *         status:
 *           type: string
 *           enum: [queued, running, paused, completed, unknown, cancelled, failed, scheduled]
 *         playwrightProject:
 *           type: string
 *         createdBy:
 *           type: string
 *         client:
 *           type: string
 *         clinic:
 *           type: string
 *         execution:
 *           type: string
 *         botName:
 *           type: string
 *         startedAt:
 *           type: string
 *           format: date-time
 *         finishedAt:
 *           type: string
 *           format: date-time
 *         notes:
 *           type: array
 *           items:
 *             type: string
 *         meta:
 *           type: object
 *           additionalProperties: true
 *         logs:
 *           type: string
 *           description: Present only in GET /executions/{id}
 */

/**
 * @openapi
 * /api/v1/executions:
 *   post:
 *     tags: [Executions]
 *     summary: Queue a new Playwright execution
 *     description: Creates an execution record and enqueues a BullMQ job.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExecutionRequest'
 *     responses:
 *       200:
 *         description: Execution queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       400:
 *         description: Validation or configuration error
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error
 *   get:
 *     tags: [Executions]
 *     summary: List all executions
 *     responses:
 *       200:
 *         description: List of executions sorted by createdAt desc
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Execution'
 */

router.post('/executions', createExecution);

/**
 * @openapi
 * /api/v1/executions/schedule:
 *   post:
 *     tags: [Executions]
 *     summary: Schedule a new Playwright execution
 *     description: Creates an execution in scheduled status and enqueues a delayed BullMQ job using scheduledAt.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExecutionRequest'
 *           example:
 *             project: elg-regression
 *             scheduledAt: 2026-06-03T15:52:00.000Z
 *             meta:
 *               bot:
 *                 botName: eligibility-bot
 *                 targetUrl: https://portal.example.com
 *                 username: runner_user
 *                 password: runner_password
 *                 otherInformation: {}
 *               patients: []
 *               config: {}
 *               rv: {}
 *     responses:
 *       200:
 *         description: Execution scheduled successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       400:
 *         description: Validation or configuration error (including invalid scheduledAt)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error
 */
router.post('/executions/schedule', createScheduledExecution);
router.get('/executions', getExecutions);

/**
 * @openapi
 * /api/v1/executions/{id}:
 *   get:
 *     tags: [Executions]
 *     summary: Get execution by id with logs
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Execution details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       404:
 *         description: Execution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *   patch:
 *     tags: [Executions]
 *     summary: Update execution by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Execution'
 *     responses:
 *       200:
 *         description: Updated execution
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       404:
 *         description: Execution not found
 *   delete:
 *     tags: [Executions]
 *     summary: Delete execution by id
 *     description: Deletes execution when it is not running.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted execution
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       400:
 *         description: Execution is still running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Execution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.get('/executions/:id', getExecution);

/**
 * @openapi
 * /api/v1/executions/{id}/stop:
 *   post:
 *     tags: [Executions]
 *     summary: Stop an active execution
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stop requested and execution updated to cancelled
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       400:
 *         description: Execution is already finished
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Execution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/executions/:id/stop', stopExecution);

/**
 * @openapi
 * /api/v1/executions/{id}/pause:
 *   post:
 *     tags: [Executions]
 *     summary: Pause a running execution
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pause requested and execution updated to paused
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       400:
 *         description: Execution is not in running state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Execution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/executions/:id/pause', pauseExecution);

/**
 * @openapi
 * /api/v1/executions/{id}/run-now:
 *   post:
 *     tags: [Executions]
 *     summary: Run a scheduled execution immediately
 *     description: Promotes a delayed BullMQ job so it runs now instead of waiting for scheduledAt.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Scheduled execution moved to queue for immediate run
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       404:
 *         description: Execution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Unexpected server error
 */
router.post('/executions/:id/run-now', runScheduledExecutionNow);

/**
 * @openapi
 * /api/v1/executions/{id}/resume:
 *   post:
 *     tags: [Executions]
 *     summary: Resume a paused execution
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resume requested and execution updated to running
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Execution'
 *       400:
 *         description: Execution is not in paused state
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       404:
 *         description: Execution not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 */
router.post('/executions/:id/resume', resumeExecution);
router.patch('/executions/:id', updateExecution);
router.delete('/executions/:id', deleteExecution);

export default router;

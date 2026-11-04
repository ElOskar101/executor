import express from 'express';
import { createRowAudit } from "../controllers/row-audit.controller";

const router = express.Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     RowAuditPatient:
 *       type: object
 *       required: [patientName, patientLastName, patientDob, memberId, verificationType, subscriberFirstName, subscriberLastName, subscriberDob, relationship]
 *       properties:
 *         patientName:
 *           type: string
 *         patientLastName:
 *           type: string
 *         patientDob:
 *           type: string
 *         memberId:
 *           type: string
 *         verificationType:
 *           type: string
 *           description: Case-insensitive; stored as lowercase.
 *           enum: [elg, fbd, eob]
 *         subscriberFirstName:
 *           type: string
 *         subscriberLastName:
 *           type: string
 *         subscriberDob:
 *           type: string
 *         relationship:
 *           type: string
 *     PdfAuditPayload:
 *       type: object
 *       required: [row, template, options]
 *       properties:
 *         row:
 *           type: object
 *           required: [audited, loaded, executed, readyToReview, executionStatus, storedFiles, formPayload, bot, cells]
 *           properties:
 *             audited:
 *               type: string
 *             loaded:
 *               type: boolean
 *             executed:
 *               type: boolean
 *             readyToReview:
 *               type: boolean
 *             executionStatus:
 *               type: string
 *             storedFiles:
 *               type: array
 *               items:
 *                 type: string
 *             formPayload:
 *               type: object
 *               additionalProperties: true
 *             bot:
 *               type: string
 *             cells:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/RowAuditPatient'
 *         template:
 *           type: object
 *           additionalProperties: true
 *         options:
 *           type: object
 *           required: [threshold]
 *           properties:
 *             threshold:
 *               type: number
 * /api/v1/row-audit:
 *   post:
 *     tags: [Row Audits]
 *     summary: Queue a row audit
 *     description: Saves a row audit record and enqueues a run-row-audit job on the row-audit queue.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/PdfAuditPayload'
 *     responses:
 *       200:
 *         description: Row audit queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               allOf:
 *                 - $ref: '#/components/schemas/PdfAuditPayload'
 *                 - type: object
 *                   properties:
 *                     _id:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid row audit payload
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorResponse'
 *       500:
 *         description: Failed to save or enqueue the row audit
 */
router.post('/row-audit', createRowAudit);

export default router;

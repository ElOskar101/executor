import { createLogger } from "../libs/logger";
import { RowAuditModel } from "../models/row-audit.model";
import { getRowAuditQueue } from "../queues/row-audit.queue";
import { PdfAuditPayload, RowAuditJobData } from "../types/row-audit.type";

const logger = createLogger("system");

export async function createRowAudit(payload: PdfAuditPayload) {
    return enqueueRowAudit(payload);
}

async function enqueueRowAudit(payload: PdfAuditPayload) {
    const { _id: rowId, ...row } = payload.row;
    const rowAudit = await RowAuditModel.create({
        row: rowId === undefined ? row : { ...row, rowId },
        template: payload.template,
        options: payload.options,
    });

    const jobData: RowAuditJobData = {
        rowAuditId: rowAudit.id,
        ...(rowId === undefined ? {} : { _id: rowId }),
        row: payload.row,
        template: payload.template,
        options: payload.options,
        config: payload.options,
    };

    const job = await getRowAuditQueue().add("run-row-audit", jobData, {
        jobId: rowAudit.id,
    });

    logger.info(`Enqueued job=${job.id} rowAuditId=${rowAudit.id}`);

    return rowAudit.toObject();
}

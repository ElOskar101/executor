import { Request, Response } from "express";
import { Error as MongooseError } from "mongoose";

import { onBadRequest, onError, onSuccess } from "../libs/res-handler";
import { createRowAudit as createQueuedRowAudit } from "../services/row-audit.service";
import { PdfAuditPayload } from "../types/row-audit.type";

export const createRowAudit = async (
    req: Request<Record<string, string>, unknown, PdfAuditPayload>,
    res: Response
) => {
    try {
        const payload = req.body;
        if (!payload?.row || !payload.template || !payload.options) {
            return onBadRequest("Row, template and options are required", res);
        }

        const rowAudit = await createQueuedRowAudit(payload);
        return onSuccess(rowAudit, res);
    } catch (error) {
        if (error instanceof MongooseError.ValidationError || error instanceof MongooseError.CastError) {
            return onBadRequest(error.message, res);
        }

        return onError(error, __filename, "createRowAudit", res);
    }
};

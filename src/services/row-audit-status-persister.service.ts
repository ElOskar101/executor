import { RowAuditModel } from "../models/row-audit.model";

export type RowAuditStatus = "running" | "done" | "failed";

export function persistRowAuditStatus(rowAuditId: string, status: RowAuditStatus) {
    if (status === "running") {
        return RowAuditModel.findOneAndUpdate(
            { _id: rowAuditId, status: "queued" },
            { status },
            { new: true },
        ).lean();
    }

    return RowAuditModel.findByIdAndUpdate(rowAuditId, { status }, { new: true }).lean();
}


export type VerificationType = "elg" | "fbd" | "eob";

export interface Patient {
    "patientName": string,
    "patientLastName": string,
    "patientDob": string,
    "memberId": string,
    "verificationType": VerificationType,
    "subscriberFirstName": string,
    "subscriberLastName": string,
    "subscriberDob": string,
    "relationship": string
}

interface Row {
    // Source database ID; stored locally as row.rowId.
    _id?: string;
    "audited": string,
    "loaded": boolean,
    "executed": boolean,
    "readyToReview": boolean,
    "executionStatus": string,
    "storedFiles": [string],
    "formPayload": Record<string, unknown>
    "bot": string,
    cells: [Patient]
}



export interface PdfAuditPayload {
    row: Row
    template: Record<string, unknown>
    options:{
        threshold: number
    }
}

export interface RowAuditJobData extends PdfAuditPayload {
    _id?: string;
    config: PdfAuditPayload["options"];
    rowAuditId: string;
}

export type RowAuditAcknowledgement =
    | { ok: true; rowId: string; rowAuditId: string }
    | { ok: false; error: string };

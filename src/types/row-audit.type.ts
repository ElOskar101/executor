
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
    rowAuditId: string;
}

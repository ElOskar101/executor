
import { Schema, model } from "mongoose";

export type { VerificationType, Patient, PdfAuditPayload } from "../types/row-audit.type";

const patient = new Schema({
    patientName: { type: String, required: true },
    patientLastName: { type: String, required: true },
    patientDob: { type: String, required: true },
    memberId: { type: String, required: true },
    verificationType: { type: String, lowercase: true, enum: ['elg', 'fbd', 'eob'], required: true },
    subscriberFirstName: { type: String, required: true },
    subscriberLastName: { type: String, required: true },
    subscriberDob: { type: String, required: true },
    relationship: { type: String, required: true }
}, { _id: false, versionKey: false, timestamps: false });

const row = new Schema({
    audited: { type: String, required: false },
    loaded: { type: Boolean, required: true },
    executed: { type: Boolean, required: true },
    readyToReview: { type: Boolean, required: true },
    executionStatus: { type: String, required: true },
    storedFiles: { type: [String], required: true },
    formPayload: { type: Schema.Types.Mixed, required: true },
    bot: { type: String, required: true },
    cells: { type: [patient], required: true }
}, { _id: false, versionKey: false, timestamps: false });

const RowAuditSchema = new Schema({
    row: { type: row, required: true },
    template: { type: Schema.Types.Mixed, required: true },
    options: {
        type: {
            threshold: { type: Number, required: true }
        },
        required: true
    }
}, {
    timestamps: true,
    versionKey: false
});

RowAuditSchema.index(
    { createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 } // ~30 days (each month)
);


export const RowAuditModel = model("RowAudit", RowAuditSchema);

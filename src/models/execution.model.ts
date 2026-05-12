import { Schema, model} from "mongoose";

const ExecutionSchema = new Schema({
    pid: Number,
    createdBy: String,
    status: {type:String, required:true, enum:['running', 'stopped', 'error', 'unknown', 'cancelled']},
    startedAt: Date,
    finishedAt: Date,
    error: String,
    note: [String],
    attachments: [String],
    outputPath: String,
    logsPath: String,
    clientId: String,
    clinicId: String,
    executionId: String,
    botId: String,
}, {
    timestamps: true,
    versionKey: false
});

ExecutionSchema.index(
    { createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 } // ~90 days (3 months)
);
ExecutionSchema.index(
    { botId: 1, status: 1}, { unique: true }
);

export const ExecutionModel =  model("Execution", ExecutionSchema);

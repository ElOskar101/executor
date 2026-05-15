import { Schema, model} from "mongoose";

const ExecutionSchema = new Schema({
    jobId: String,
    pid: Number,
    createdBy: String,
    playwrightProject: String,
    playwrightExecutionId: String,
    status: {type:String, required:true, enum:['queued', 'running', 'completed', 'error', 'unknown', 'cancelled', 'failed']},
    startedAt: Date,
    finishedAt: Date,
    error: String,
    note: [String],
    attachments: [String],
    outputPath: String,
    logsPath: String,
    client: String,
    clinic: String,
    execution: String,
    bot: String,
}, {
    timestamps: true,
    versionKey: false
});

ExecutionSchema.index(
    { createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 } // ~90 days (3 months)
);

ExecutionSchema.index(
    { client: 1, clinic: 1, execution: 1, bot: 1 },
);

ExecutionSchema.index({ jobId: 1 });
ExecutionSchema.index({ status: 1, createdAt: -1 });

export const ExecutionModel =  model("Execution", ExecutionSchema);

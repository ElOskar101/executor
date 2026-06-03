import { Schema, model} from "mongoose";


const bot = new Schema({ // For playwright project
    botName: {type: String},
    targetUrl: {type: String},
    username: {type: String},
    password: {type: String},
    otherInformation:{type:Schema.Types.Mixed, default:{}},
}, {
    _id: false, versionKey: false, timestamps: false});

const patient = new Schema({ // Patient that would be tested in playwright
    patientName: {type: String},
    patientLastName:{type: String},
    patientMemberId: {type: String},
    patientDob: {type: String},
    policyHolderName: {type: String},
    policyHolderLastName: {type: String},
    policyHolderDob: {type: String},
    relationship: {type: String},
    zipCode: {type: String},
    clinic:{type: String},
    verificationType: {type: String, enum:['elg', 'fbd']},
    filenames:{type:String},
    otherInformation:{type:Schema.Types.Mixed, default:{}},

}, {_id: false, versionKey: false, timestamps: false});

const ExecutionSchema = new Schema({
    // Execution properties only for record keeping (creation, update, runtime jobs)
    runId: String,
    project: String,
    status: {type:String, required:true, enum:['queued', 'running', 'paused', 'completed', 'unknown', 'cancelled', 'failed', 'scheduled']},
    scheduledAt: Date,
    startedAt: Date,
    finishedAt: Date,
    notes: [String],
    // Control properties for requesting filters (GETs, http requests after execution)
    createdBy: String,
    client: String,
    clinic: String,
    execution: String,
    botName: String,
    // Playwright execution properties needed for playwright project runtime. It is like runtime context
    // (Runtime context for execution in playwright)
    meta:{
        bot: bot,
        patients: [patient],
        config:{type: Schema.Types.Mixed, default:{}},
        rv:{type: Schema.Types.Mixed, default:{}},
        outputPath: {type:String},
        logsPath: {type:String},
        workers: {type:Number, default:1},
        retries: {type:Number, default:0},
        headed:{type:Boolean, default:false},
    }
}, {
    timestamps: true,
    versionKey: false
});

ExecutionSchema.index(
    { createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 } // ~30 days (each month)
);

ExecutionSchema.index(
    { client: 1, clinic: 1, execution: 1, bot: 1 },
);

ExecutionSchema.index({ jobId: 1 });
ExecutionSchema.index({ status: 1, createdAt: -1 });

export const ExecutionModel =  model("Execution", ExecutionSchema);

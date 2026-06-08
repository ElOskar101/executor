import { Schema, model} from "mongoose";


const bot = new Schema({ // For playwright project
    botName: {type: String, required: true},
    targetUrl: {type: String, required: true},
    username: {type: String, required: true},
    password: {type: String, required: true},
    otherInformation:{type:Schema.Types.Mixed, default:{}, required: true},
}, {
    _id: false, versionKey: false, timestamps: false});

const patientPropertyDetailDefinition = {
    key: {type: String, required: true},
    value: {type: String, required: true}
}

const patient = new Schema({ // Patient that would be tested in playwright
    id:{type: String},
    patientName: {type: patientPropertyDetailDefinition, required: true},
    patientLastName:{type: patientPropertyDetailDefinition, required: true},
    patientMemberId: {type: patientPropertyDetailDefinition, required: true},
    patientDob: {type: patientPropertyDetailDefinition, required: true},
    policyHolderName: {type: patientPropertyDetailDefinition, required: true},
    policyHolderLastName: {type: patientPropertyDetailDefinition, required: true},
    policyHolderDob: {type: patientPropertyDetailDefinition, required: true},
    relationship: {type: patientPropertyDetailDefinition, required: true},
    zipCode: {type: patientPropertyDetailDefinition, required: true},
    verificationType: {type: String, enum:['elg', 'fbd'], required: true},
    filenames: {type: [{type:String}], required: true},
    otherInformation:{type:Schema.Types.Mixed, default:{}, required: true},

}, {_id: false, versionKey: false, timestamps: false});

const ExecutionSchema = new Schema({
    // Execution properties only for record keeping (creation, update, runtime jobs)
    runId: { type: String},
    project: { type: String, required: true },
    status: {type:String, required:true, enum:['queued', 'running', 'paused', 'completed', 'unknown', 'cancelled', 'failed', 'scheduled']},
    scheduledAt: Date,
    startedAt: { type: Date },
    finishedAt: { type: Date },
    notes: { type: [String], required: true, default: [] },
    // Control properties for requesting filters (GETs, http requests after execution)
    createdBy: { type: String },
    client: { type: String },
    clinic: { type: String },
    execution: { type: String},
    botName: { type: String },
    // Playwright execution properties needed for playwright project runtime. It is like runtime context
    // (Runtime context for execution in playwright)
    context:{
        type: {
            bot: { type: bot, required: true },
            patients: { type: [patient], required: true },
            executionId: {type: String},
            accessToken: {type: String},
            apiUrl:{type: String},
            config:{type: Schema.Types.Mixed, default:{}, required: true},
            rv:{type: Schema.Types.Mixed, default:{}, required: true},
            outputPath: {type:String},
            logsPath: {type:String},
            workers: {type:Number, default:1},
            retries: {type:Number, default:0},
            headed:{type:Boolean, default:false},
        },
        required: true,
    }
}, {
    timestamps: true,
    versionKey: false
});

ExecutionSchema.index(
    { createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 } // ~30 days (each month)
);

ExecutionSchema.index(
    { client: 1, clinic: 1, execution: 1, botName: 1 },
);

ExecutionSchema.index({ status: 1, createdAt: -1 });

export const ExecutionModel =  model("Execution", ExecutionSchema);

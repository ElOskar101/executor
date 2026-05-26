import { Schema, model} from "mongoose";

const LogSchema = new Schema({
    runId: {type: Schema.Types.ObjectId, ref: "Execution", required: true, index: true, unique: true},
    content: {type: [String], default: []},
}, {
    timestamps: true,
    versionKey: false
});

export const LogModel =  model("Log", LogSchema);

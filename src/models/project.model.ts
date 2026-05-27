import { Schema, model} from "mongoose";

const LogSchema = new Schema({
    name: {type: Schema.Types.ObjectId, ref: "Execution", required: true, index: true, unique: true},
    content: {type: [String], default: []},
}, {
    timestamps: true,
    versionKey: false
});

LogSchema.index(
    { createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 } // ~30 days (each month)
);

export const LogModel =  model("Log", LogSchema);

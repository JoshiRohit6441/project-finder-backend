import mongoose from "mongoose";

const suppressionSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ["email", "phone", "domain"], required: true },
    value: { type: String, required: true, lowercase: true, trim: true },
    reason: { type: String, default: "opt_out" },
    source: { type: String, default: "system" },
  },
  { timestamps: true }
);

suppressionSchema.index({ type: 1, value: 1 }, { unique: true });

const Suppression = mongoose.model("Suppression", suppressionSchema);

export { Suppression };

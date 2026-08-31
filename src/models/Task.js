import mongoose from "mongoose";
import { TASK_STATUS } from "../constants/index.js";

const taskSchema = new mongoose.Schema(
  {
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", required: true, index: true },
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailThread" },
    messageId: { type: mongoose.Schema.Types.ObjectId, ref: "Message" },
    title: { type: String, required: true },
    status: { type: String, enum: Object.values(TASK_STATUS), default: TASK_STATUS.OPEN, index: true },
    conversationSummary: { type: String, default: "" },
    clientRequirement: { type: String, default: "" },
    aiInterpretation: { type: String, default: "" },
    proposedResponse: { type: String, default: "" },
    neededFromUser: { type: String, default: "" },
    confidence: { type: Number, default: 0 },
    classification: { type: String, default: "" },
    userNotes: { type: String, default: "" },
  },
  { timestamps: true }
);

taskSchema.index({ status: 1, createdAt: -1 });

const Task = mongoose.model("Task", taskSchema, "tasks");

export { Task };

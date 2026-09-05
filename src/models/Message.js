import mongoose from "mongoose";
import { MESSAGE_STATUS, MESSAGE_DIRECTION } from "../constants/index.js";

const messageSchema = new mongoose.Schema(
  {
    threadId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailThread", index: true },
    leadId: { type: mongoose.Schema.Types.ObjectId, ref: "Lead", index: true },
    accountId: { type: mongoose.Schema.Types.ObjectId, ref: "EmailAccount" },
    direction: { type: String, enum: Object.values(MESSAGE_DIRECTION), required: true },
    status: { type: String, enum: Object.values(MESSAGE_STATUS), default: MESSAGE_STATUS.DRAFT, index: true },
    from: { type: String, default: "" },
    to: { type: String, default: "" },
    subject: { type: String, default: "" },
    bodyText: { type: String, default: "" },
    bodyHtml: { type: String, default: "" },
    internetMessageId: { type: String, default: "" },
    inReplyTo: { type: String, default: "" },
    references: { type: [String], default: [] },
    classification: { type: String, default: "" },
    confidence: { type: Number, default: 0 },
    idempotencyKey: { type: String },
    error: { type: String, default: "" },
    sentAt: { type: Date },
    bounceReason: { type: String, default: "" },
    channel: { type: String, enum: ["email", "whatsapp"], default: "email" },
  },
  { timestamps: true }
);

messageSchema.index({ idempotencyKey: 1 }, { unique: true, sparse: true });
messageSchema.index({ internetMessageId: 1 });

const Message = mongoose.model("Message", messageSchema, "messages");

export { Message };

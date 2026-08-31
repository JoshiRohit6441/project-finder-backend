import { connectInfra } from "../infra.js";
import { Lead } from "../models/Lead.js";
import { Meeting } from "../models/Meeting.js";

const EMAIL = String(process.argv[2] || "rjuk09072003@gmail.com").toLowerCase().trim();

await connectInfra();
const leads = await Lead.find({ email: EMAIL }).select("_id status").lean();
const meetings = await Meeting.find({ leadId: { $in: leads.map((item) => item._id) } }).sort({ createdAt: 1 }).lean();
console.log(JSON.stringify({
  leads: leads.length,
  meetings: meetings.map((item) => ({
    status: item.status,
    startIst: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", hour12: true }).format(item.startAt),
    endIst: new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true }).format(item.endAt),
  })),
}, null, 2));
process.exit(0);

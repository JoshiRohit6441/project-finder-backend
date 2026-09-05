import { Campaign } from "../../models/Campaign.js";
import { ScrapeJob } from "../../models/ScrapeJob.js";
import { Lead } from "../../models/Lead.js";
import { Task } from "../../models/Task.js";
import { Message } from "../../models/Message.js";
import { JOB_STATUS, LEAD_STATUS, TASK_STATUS, MESSAGE_STATUS, MESSAGE_DIRECTION } from "../../constants/index.js";

async function getDashboard() {
  const [campaigns, jobs, leads, jobByStatus, leadByStatus, recentJobs, recentLeads, openTasks, outreachSent, replies] = await Promise.all([
    Campaign.countDocuments(),
    ScrapeJob.countDocuments(),
    Lead.countDocuments(),
    ScrapeJob.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    Lead.aggregate([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    ScrapeJob.find().sort({ updatedAt: -1 }).limit(8).lean(),
    Lead.find().sort({ createdAt: -1 }).limit(8).select("businessName country status leadScore email createdAt").lean(),
    Task.countDocuments({ status: { $in: [TASK_STATUS.OPEN, TASK_STATUS.WAITING_USER] } }),
    Message.countDocuments({ direction: MESSAGE_DIRECTION.OUTBOUND, status: MESSAGE_STATUS.SENT }),
    Message.countDocuments({ direction: MESSAGE_DIRECTION.INBOUND }),
  ]);

  const jobMap = Object.fromEntries(jobByStatus.map((item) => [item._id, item.count]));
  const leadMap = Object.fromEntries(leadByStatus.map((item) => [item._id, item.count]));

  return {
    totals: {
      campaigns,
      jobs,
      leads,
      discovered: leads,
      verified: leadMap[LEAD_STATUS.VERIFIED] || 0,
      qualified: leadMap[LEAD_STATUS.QUALIFIED] || 0,
      rejected: leadMap[LEAD_STATUS.INVALID] || 0,
      runningJobs: jobMap[JOB_STATUS.RUNNING] || 0,
      queuedJobs: jobMap[JOB_STATUS.QUEUED] || 0,
      humanReview: leadMap[LEAD_STATUS.HUMAN_REVIEW_REQUIRED] || 0,
      interested: leadMap[LEAD_STATUS.INTERESTED] || 0,
      meetings: leadMap[LEAD_STATUS.MEETING_SCHEDULED] || 0,
      conversions: leadMap[LEAD_STATUS.WON] || 0,
      lost: leadMap[LEAD_STATUS.LOST] || 0,
      openTasks,
      outreachSent,
      replies,
    },
    jobByStatus: jobMap,
    leadByStatus: leadMap,
    recentJobs,
    recentLeads,
  };
}

export { getDashboard };

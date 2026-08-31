import { Task } from "../../models/Task.js";
import { Lead } from "../../models/Lead.js";
import { resolveTask } from "../replies/replies.service.js";
import { httpError } from "../../utils/httpError.js";
import { paginate } from "../../utils/query.js";

async function listTasks({ page = 1, limit = 20, status }) {
  const filter = {};
  if (status) filter.status = status;
  const { items, total } = await paginate(Task, filter, { page, limit });
  const leadIds = items.map((item) => item.leadId);
  const leads = await Lead.find({ _id: { $in: leadIds } }).select("businessName email status").lean();
  const map = Object.fromEntries(leads.map((item) => [String(item._id), item]));
  return {
    items: items.map((item) => ({ ...item, lead: map[String(item.leadId)] || null })),
    total,
    page,
    limit,
  };
}

async function getTask(id) {
  const task = await Task.findById(id).lean();
  if (!task) throw httpError("Task not found", 404);
  const lead = await Lead.findById(task.leadId).lean();
  return { ...task, lead };
}

export { listTasks, getTask, resolveTask };

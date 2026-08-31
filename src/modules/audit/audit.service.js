import { AuditLog } from "../../models/AuditLog.js";

async function writeAudit({ actorId, action, entityType, entityId, metadata, ip }) {
  await AuditLog.create({
    actorId: actorId || null,
    action,
    entityType,
    entityId: entityId ? String(entityId) : "",
    metadata: metadata || {},
    ip: ip || "",
  });
}

export { writeAudit };

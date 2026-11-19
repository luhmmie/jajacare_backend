import { AuditLog } from '../models/AuditLog.js';

export const logAudit = async ({ req, action, entity, entityId, changes }) => {
  try {
    await AuditLog.create({
      actorId: req.user?._id,
      action,
      entity,
      entityId: entityId?.toString(),
      changes,
      ip: req.ip,
    });
  } catch (e) {
    console.error('Audit log failed:', e.message);
  }
};
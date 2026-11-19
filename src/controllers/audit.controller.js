import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const list = asyncHandler(async (req, res) => {
  const { actorId, entity, from, to, page = 1, limit = 20 } = req.query;
  const filter = {};
  if (actorId) filter.actorId = actorId;
  if (entity) filter.entity = entity;
  if (from || to) {
    filter.timestamp = {};
    if (from) filter.timestamp.$gte = new Date(from);
    if (to) filter.timestamp.$lte = new Date(to);
  }
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    AuditLog.find(filter).sort('-timestamp').skip(skip).limit(Number(limit)),
    AuditLog.countDocuments(filter),
  ]);
  res.json({ data, total, page: Number(page), limit: Number(limit) });
});
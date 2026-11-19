import mongoose from 'mongoose';

const auditLogSchema = new mongoose.Schema(
  {
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    action: { type: String, required: true },
    entity: { type: String, required: true },
    entityId: String,
    changes: mongoose.Schema.Types.Mixed,
    ip: String,
    timestamp: { type: Date, default: Date.now, immutable: true },
  },
  { timestamps: false }
);

auditLogSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

export const AuditLog = mongoose.model('AuditLog', auditLogSchema);
// ===== BEGIN fill.mjs =====
import fs from 'fs';
import path from 'path';

const files = {};

files['src/routes/patients.routes.js'] = `import { Router } from 'express';
import * as c from '../controllers/patients.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/', c.list);
r.get('/:id', c.getOne);
r.get('/:id/history', c.history);
r.post('/', authorize('admin', 'receptionist'), c.create);
r.patch('/:id', authorize('admin', 'receptionist'), c.update);
r.delete('/:id', authorize('admin'), c.remove);
export default r;
`;

files['src/routes/consultations.routes.js'] = `import { Router } from 'express';
import * as c from '../controllers/consultations.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.post('/', authorize('doctor'), c.create);
r.get('/:id', authorize('doctor', 'nurse', 'admin'), c.getOne);
r.patch('/:id', authorize('doctor'), c.update);
r.post('/:id/complete', authorize('doctor'), c.complete);
r.get('/:id/print', authorize('doctor', 'nurse', 'admin'), c.printable);
r.post('/:id/prescription', authorize('doctor'), c.addPrescription);
r.delete('/:id/prescription/:itemId', authorize('doctor'), c.removePrescription);
export default r;
`;

files['src/routes/pharmacy.routes.js'] = `import { Router } from 'express';
import * as c from '../controllers/pharmacy.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/queue', authorize('pharmacist', 'admin'), c.queue);
r.post('/dispense/:id', authorize('pharmacist'), c.dispense);
r.post('/reject/:id', authorize('pharmacist'), c.reject);
r.get('/stock', authorize('pharmacist', 'admin'), c.getStock);
r.post('/reorder/:itemId', authorize('pharmacist', 'admin'), c.reorder);
r.post('/check-interactions', authorize('pharmacist'), c.checkInteractions);
export default r;
`;

files['src/routes/dashboard.routes.js'] = `import { Router } from 'express';
import * as c from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/stats', c.stats);
r.get('/weekly-visits', c.weeklyVisits);
r.get('/activity', c.activity);
export default r;
`;

files['src/routes/users.routes.js'] = `import { Router } from 'express';
import * as c from '../controllers/users.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.patch('/me/profile', c.updateProfile);
r.patch('/me/password', c.updatePassword);
r.get('/', authorize('admin'), c.list);
r.post('/', authorize('admin'), c.create);
r.patch('/:id', authorize('admin'), c.update);
r.delete('/:id', authorize('admin'), c.remove);
r.post('/:id/revoke', authorize('admin'), c.revoke);
export default r;
`;

files['src/routes/settings.routes.js'] = `import { Router } from 'express';
import * as c from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/clinic', c.get);
r.patch('/clinic', authorize('admin'), c.update);
export default r;
`;

files['src/routes/audit.routes.js'] = `import { Router } from 'express';
import * as c from '../controllers/audit.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate, authorize('admin'));
r.get('/', c.list);
export default r;
`;

files['src/middleware/auth.js'] = `import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'No token provided', 401);
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) {
      throw new AppError('UNAUTHORIZED', 'User inactive or not found', 401);
    }
    req.user = user;
    next();
  } catch (err) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
  }
});

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('FORBIDDEN', 'Insufficient permissions', 403));
  }
  next();
};
`;

files['src/middleware/validate.js'] = `import { AppError } from '../utils/AppError.js';

export const validate = (schema) => (req, res, next) => {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const msg = result.error.errors.map((e) => e.path.join('.') + ': ' + e.message).join('; ');
    return next(new AppError('VALIDATION_ERROR', msg, 400));
  }
  req.body = result.data;
  next();
};
`;

files['src/middleware/errorHandler.js'] = `export const errorHandler = (err, req, res, next) => {
  console.error(err);
  const statusCode = err.statusCode || 500;
  const code = err.code || 'SERVER_ERROR';
  const message = err.message || 'Something went wrong';
  res.status(statusCode).json({ error: { code, message } });
};

export const notFound = (req, res, next) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route ' + req.originalUrl + ' not found' } });
};
`;

files['src/utils/audit.js'] = `import { AuditLog } from '../models/AuditLog.js';

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
`;

files['src/models/User.js'] = `import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    staffId: { type: String, required: true, unique: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    phone: { type: String },
    password: { type: String, required: true, select: false },
    role: {
      type: String,
      enum: ['admin', 'receptionist', 'nurse', 'doctor', 'pharmacist'],
      required: true,
    },
    isActive: { type: Boolean, default: true },
    staffIdVerified: { type: Boolean, default: true },
    licenseNumber: { type: String },
    resetPasswordToken: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  delete obj.password;
  delete obj.resetPasswordToken;
  delete obj.resetPasswordExpires;
  return obj;
};

export const User = mongoose.model('User', userSchema);
`;

files['src/models/Patient.js'] = `import mongoose from 'mongoose';

const patientSchema = new mongoose.Schema(
  {
    patientId: { type: String, required: true, unique: true },
    firstName: { type: String, required: true, trim: true },
    middleName: { type: String, trim: true },
    lastName: { type: String, required: true, trim: true },
    gender: { type: String, enum: ['male', 'female'], required: true },
    dateOfBirth: { type: Date, required: true },
    phone: { type: String, required: true },
    address: { type: String },
    matricNumber: { type: String, required: true, unique: true, trim: true },
    faculty: { type: String },
    department: { type: String },
    hallOfResidence: { type: String },
    emergencyContact: {
      name: String,
      relationship: String,
      phone: String,
      address: String,
    },
    bloodGroup: { type: String, enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] },
    genotype: { type: String, enum: ['AA', 'AS', 'SS', 'AC', 'SC'] },
    allergies: [{ type: String }],
    chronicConditions: [{ type: String }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    lastVisit: { type: Date },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

patientSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

export const Patient = mongoose.model('Patient', patientSchema);
`;

files['src/models/Appointment.js'] = `import mongoose from 'mongoose';

const appointmentSchema = new mongoose.Schema(
  {
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    timeSlot: { type: String, required: true },
    reason: { type: String },
    status: {
      type: String,
      enum: ['scheduled', 'checked_in', 'in_consultation', 'completed', 'cancelled', 'no_show'],
      default: 'scheduled',
    },
    checkedInAt: { type: Date },
    cancelReason: { type: String },
    bookedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

appointmentSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

export const Appointment = mongoose.model('Appointment', appointmentSchema);
`;

files['src/models/Consultation.js'] = `import mongoose from 'mongoose';

const prescriptionSchema = new mongoose.Schema(
  {
    drug: { type: String, required: true },
    dose: String,
    frequency: String,
    duration: String,
    instructions: String,
    dispensed: { type: Boolean, default: false },
    dispensedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dispensedAt: Date,
    rejected: { type: Boolean, default: false },
    rejectionReason: String,
  },
  { _id: true }
);

const consultationSchema = new mongoose.Schema(
  {
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', required: true },
    patientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', required: true },
    doctorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    vitals: {
      temperature: Number,
      bloodPressure: String,
      pulse: Number,
      spo2: Number,
      weightKg: Number,
      heightCm: Number,
      bmi: Number,
      recordedAt: Date,
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
    complaints: { symptoms: String, duration: String },
    diagnosis: { code: String, text: String, notes: String },
    prescription: [prescriptionSchema],
    status: { type: String, enum: ['draft', 'completed', 'dispensed'], default: 'draft' },
    completedAt: Date,
  },
  { timestamps: true }
);

consultationSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  if (obj.prescription) {
    obj.prescription = obj.prescription.map((p) => {
      p.id = p._id.toString();
      delete p._id;
      return p;
    });
  }
  return obj;
};

export const Consultation = mongoose.model('Consultation', consultationSchema);
`;

files['src/models/Stock.js'] = `import mongoose from 'mongoose';

const stockSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    stock: { type: Number, default: 0 },
    threshold: { type: Number, default: 50 },
    unit: { type: String, default: 'units' },
    lastReorderAt: Date,
  },
  { timestamps: true }
);

stockSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

export const Stock = mongoose.model('Stock', stockSchema);
`;

files['src/models/ClinicSettings.js'] = `import mongoose from 'mongoose';

const clinicSettingsSchema = new mongoose.Schema(
  {
    name: { type: String, default: 'University Health Services (Jaja Clinic)' },
    workingHours: {
      open: { type: String, default: '08:00' },
      close: { type: String, default: '16:00' },
      days: { type: [Number], default: [1, 2, 3, 4, 5] },
    },
    slotMinutes: { type: Number, default: 15 },
    advanceBookingDays: { type: Number, default: 14 },
    walkInBufferPercent: { type: Number, default: 35 },
  },
  { timestamps: true }
);

export const ClinicSettings = mongoose.model('ClinicSettings', clinicSettingsSchema);
`;

files['src/models/AuditLog.js'] = `import mongoose from 'mongoose';

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
`;

files['src/controllers/auth.controller.js'] = `import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const signAccess = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
const signRefresh = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });

export const login = asyncHandler(async (req, res) => {
  const { staffId, password } = req.body;
  if (!staffId || !password) throw new AppError('VALIDATION_ERROR', 'staffId and password required', 400);
  const user = await User.findOne({ staffId }).select('+password');
  if (!user || !user.isActive) throw new AppError('UNAUTHORIZED', 'Invalid credentials', 401);
  const ok = await user.comparePassword(password);
  if (!ok) throw new AppError('UNAUTHORIZED', 'Invalid credentials', 401);
  const token = signAccess(user._id);
  const refreshToken = signRefresh(user._id);
  res.json({ token, refreshToken, user });
});

export const logout = asyncHandler(async (req, res) => {
  res.json({ message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });
    console.log('Password reset token for ' + email + ': ' + token);
  }
  res.json({ message: 'If the email exists, a reset link has been sent' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) throw new AppError('VALIDATION_ERROR', 'token and newPassword required', 400);
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({ resetPasswordToken: hashed, resetPasswordExpires: { $gt: Date.now() } });
  if (!user) throw new AppError('UNAUTHORIZED', 'Invalid or expired reset token', 401);
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ message: 'Password reset successful' });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('VALIDATION_ERROR', 'refreshToken required', 400);
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) throw new Error('inactive');
    const token = signAccess(user._id);
    res.json({ token });
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);
  }
});
`;

// ---- Write all files ----
let count = 0;
for (const [rel, content] of Object.entries(files)) {
  const full = path.resolve(rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('WROTE:', rel);
  count++;
}
console.log('\\nDone. ' + count + ' files written.');
// ===== END fill.mjs =====
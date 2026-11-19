// ===== BEGIN fill2.mjs =====
import fs from 'fs';
import path from 'path';

const files = {};

files['src/controllers/patients.controller.js'] = `import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Consultation } from '../models/Consultation.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

const generatePatientId = async () => {
  const year = new Date().getFullYear();
  const last = await Patient.findOne({ patientId: new RegExp('^JC-' + year + '-') }).sort({ patientId: -1 }).lean();
  const next = last ? parseInt(last.patientId.split('-')[2], 10) + 1 : 1;
  return 'JC-' + year + '-' + String(next).padStart(4, '0');
};

export const list = asyncHandler(async (req, res) => {
  const { search = '', faculty, status, page = 1, limit = 20, sort = '-createdAt' } = req.query;
  const filter = {};
  if (search) {
    filter.$or = [
      { firstName: new RegExp(search, 'i') },
      { lastName: new RegExp(search, 'i') },
      { matricNumber: new RegExp(search, 'i') },
      { phone: new RegExp(search, 'i') },
      { patientId: new RegExp(search, 'i') },
    ];
  }
  if (faculty) filter.faculty = faculty;
  if (status) filter.status = status;
  const skip = (Number(page) - 1) * Number(limit);
  const [data, total] = await Promise.all([
    Patient.find(filter).sort(sort).skip(skip).limit(Number(limit)),
    Patient.countDocuments(filter),
  ]);
  res.json({ data, total, page: Number(page), limit: Number(limit) });
});

export const getOne = asyncHandler(async (req, res) => {
  const patient = await Patient.findById(req.params.id);
  if (!patient) throw new AppError('NOT_FOUND', 'Patient not found', 404);
  res.json(patient);
});

export const create = asyncHandler(async (req, res) => {
  const exists = await Patient.findOne({ matricNumber: req.body.matricNumber });
  if (exists) throw new AppError('DUPLICATE', 'Matric number already registered', 409);
  const patientId = await generatePatientId();
  const patient = await Patient.create({ ...req.body, patientId, registeredBy: req.user._id });
  await logAudit({ req, action: 'created_patient', entity: 'patient', entityId: patient._id, changes: { patientId } });
  res.status(201).json(patient);
});

export const update = asyncHandler(async (req, res) => {
  const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
  if (!patient) throw new AppError('NOT_FOUND', 'Patient not found', 404);
  await logAudit({ req, action: 'updated_patient', entity: 'patient', entityId: patient._id, changes: req.body });
  res.json(patient);
});

export const remove = asyncHandler(async (req, res) => {
  const patient = await Patient.findByIdAndDelete(req.params.id);
  if (!patient) throw new AppError('NOT_FOUND', 'Patient not found', 404);
  await logAudit({ req, action: 'deleted_patient', entity: 'patient', entityId: patient._id });
  res.json({ message: 'Patient deleted' });
});

export const history = asyncHandler(async (req, res) => {
  const patientId = req.params.id;
  const [visits, prescriptions, appointments] = await Promise.all([
    Consultation.find({ patientId }).sort('-createdAt'),
    Consultation.find({ patientId, 'prescription.0': { $exists: true } }).select('prescription createdAt'),
    Appointment.find({ patientId }).sort('-createdAt'),
  ]);
  res.json({ visits, prescriptions, appointments });
});
`;

files['src/controllers/appointments.controller.js'] = `import { Appointment } from '../models/Appointment.js';
import { Patient } from '../models/Patient.js';
import { User } from '../models/User.js';
import { ClinicSettings } from '../models/ClinicSettings.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

const buildSlots = (open, close, slotMinutes) => {
  const slots = [];
  const [oh, om] = open.split(':').map(Number);
  const [ch, cm] = close.split(':').map(Number);
  let cur = oh * 60 + om;
  const end = ch * 60 + cm;
  while (cur < end) {
    const h = String(Math.floor(cur / 60)).padStart(2, '0');
    const m = String(cur % 60).padStart(2, '0');
    slots.push(h + ':' + m);
    cur += slotMinutes;
  }
  return slots;
};

export const list = asyncHandler(async (req, res) => {
  const { date, doctorId, status, patientId } = req.query;
  const filter = {};
  if (date) filter.date = date;
  if (doctorId) filter.doctorId = doctorId;
  if (status) filter.status = status;
  if (patientId) filter.patientId = patientId;
  if (req.user.role === 'doctor') filter.doctorId = req.user._id;
  const appointments = await Appointment.find(filter)
    .populate('patientId', 'firstName lastName patientId matricNumber')
    .populate('doctorId', 'name role')
    .sort('date timeSlot');
  res.json(appointments);
});

export const create = asyncHandler(async (req, res) => {
  const { patientId, doctorId, date, timeSlot, reason } = req.body;
  if (!patientId || !doctorId || !date || !timeSlot) throw new AppError('VALIDATION_ERROR', 'patientId, doctorId, date, timeSlot required', 400);
  const patient = await Patient.findById(patientId);
  if (!patient) throw new AppError('NOT_FOUND', 'Patient not found', 404);
  const doctor = await User.findById(doctorId);
  if (!doctor || doctor.role !== 'doctor') throw new AppError('NOT_FOUND', 'Doctor not found', 404);
  const conflict = await Appointment.findOne({ doctorId, date, timeSlot, status: { $ne: 'cancelled' } });
  if (conflict) throw new AppError('CONFLICT', 'Time slot already booked for this doctor', 409);
  const appt = await Appointment.create({ patientId, doctorId, date, timeSlot, reason, bookedBy: req.user._id });
  await logAudit({ req, action: 'created_appointment', entity: 'appointment', entityId: appt._id });
  res.status(201).json(appt);
});

export const update = asyncHandler(async (req, res) => {
  const appt = await Appointment.findById(req.params.id);
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found', 404);
  if (req.user.role === 'doctor' && appt.doctorId.toString() !== req.user._id.toString()) throw new AppError('FORBIDDEN', 'Not your appointment', 403);
  const allowed = ['status', 'date', 'timeSlot', 'cancelReason'];
  for (const k of allowed) if (k in req.body) appt[k] = req.body[k];
  await appt.save();
  await logAudit({ req, action: 'updated_appointment', entity: 'appointment', entityId: appt._id, changes: req.body });
  res.json(appt);
});

export const slots = asyncHandler(async (req, res) => {
  const { doctorId, date } = req.query;
  if (!doctorId || !date) throw new AppError('VALIDATION_ERROR', 'doctorId and date required', 400);
  const settings = (await ClinicSettings.findOne()) || { workingHours: { open: '08:00', close: '16:00' }, slotMinutes: 15 };
  const allSlots = buildSlots(settings.workingHours.open, settings.workingHours.close, settings.slotMinutes);
  const booked = await Appointment.find({ doctorId, date, status: { $ne: 'cancelled' } }).select('timeSlot');
  const bookedSet = new Set(booked.map((b) => b.timeSlot));
  res.json({ slots: allSlots.filter((s) => !bookedSet.has(s)) });
});

export const queue = asyncHandler(async (req, res) => {
  const { date = new Date().toISOString().slice(0, 10) } = req.query;
  const filter = { status: 'checked_in', date };
  if (req.user.role === 'doctor') filter.doctorId = req.user._id;
  const items = await Appointment.find(filter)
    .populate('patientId', 'firstName lastName patientId matricNumber')
    .sort('checkedInAt');
  res.json(items);
});

export const checkin = asyncHandler(async (req, res) => {
  const appt = await Appointment.findById(req.params.id);
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found', 404);
  if (appt.status !== 'scheduled') throw new AppError('CONFLICT', 'Only scheduled appointments can be checked in', 409);
  appt.status = 'checked_in';
  appt.checkedInAt = new Date();
  await appt.save();
  await logAudit({ req, action: 'checked_in_appointment', entity: 'appointment', entityId: appt._id });
  res.json(appt);
});
`;

files['src/controllers/consultations.controller.js'] = `import { Consultation } from '../models/Consultation.js';
import { Appointment } from '../models/Appointment.js';
import { Patient } from '../models/Patient.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

const calcBmi = (w, h) => (w && h ? Math.round((w / Math.pow(h / 100, 2)) * 10) / 10 : undefined);

export const create = asyncHandler(async (req, res) => {
  const { appointmentId } = req.body;
  if (!appointmentId) throw new AppError('VALIDATION_ERROR', 'appointmentId required', 400);
  const appt = await Appointment.findById(appointmentId);
  if (!appt) throw new AppError('NOT_FOUND', 'Appointment not found', 404);
  if (appt.doctorId.toString() !== req.user._id.toString()) throw new AppError('FORBIDDEN', 'Not your appointment', 403);
  const existing = await Consultation.findOne({ appointmentId });
  if (existing) return res.json(existing);
  const consultation = await Consultation.create({ appointmentId, patientId: appt.patientId, doctorId: appt.doctorId, status: 'draft' });
  appt.status = 'in_consultation';
  await appt.save();
  await logAudit({ req, action: 'started_consultation', entity: 'consultation', entityId: consultation._id });
  res.status(201).json(consultation);
});

export const getOne = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id).populate('patientId').populate('doctorId', 'name');
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  res.json(c);
});

export const update = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id);
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  if (c.doctorId.toString() !== req.user._id.toString()) throw new AppError('FORBIDDEN', 'Not your consultation', 403);
  if (c.status !== 'draft') throw new AppError('CONFLICT', 'Consultation is locked', 409);
  const body = { ...req.body };
  if (body.vitals) {
    if (body.vitals.weightKg && body.vitals.heightCm) body.vitals.bmi = calcBmi(body.vitals.weightKg, body.vitals.heightCm);
    body.vitals.recordedAt = new Date();
    body.vitals.recordedBy = req.user._id;
  }
  Object.assign(c, body);
  await c.save();
  await logAudit({ req, action: 'updated_consultation', entity: 'consultation', entityId: c._id, changes: req.body });
  res.json(c);
});

export const complete = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id);
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  if (c.doctorId.toString() !== req.user._id.toString()) throw new AppError('FORBIDDEN', 'Not your consultation', 403);
  if (c.status !== 'draft') throw new AppError('CONFLICT', 'Already completed', 409);
  c.status = 'completed';
  c.completedAt = new Date();
  await c.save();
  await Appointment.findByIdAndUpdate(c.appointmentId, { status: 'completed' });
  await Patient.findByIdAndUpdate(c.patientId, { lastVisit: new Date() });
  await logAudit({ req, action: 'completed_consultation', entity: 'consultation', entityId: c._id });
  res.json(c);
});

export const printable = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id).populate('patientId').populate('doctorId', 'name');
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  res.json(c);
});

export const addPrescription = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id);
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  if (c.doctorId.toString() !== req.user._id.toString()) throw new AppError('FORBIDDEN', 'Not your consultation', 403);
  if (c.status !== 'draft') throw new AppError('CONFLICT', 'Consultation is locked', 409);
  const patient = await Patient.findById(c.patientId);
  const allergy = (patient?.allergies || []).find((a) => req.body.drug.toLowerCase().includes(a.toLowerCase()));
  if (allergy) {
    return res.status(409).json({ error: { code: 'CONFLICT', message: 'Drug allergy detected' }, warning: 'Drug allergy detected' });
  }
  c.prescription.push(req.body);
  await c.save();
  res.json(c);
});

export const removePrescription = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id);
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  if (c.doctorId.toString() !== req.user._id.toString()) throw new AppError('FORBIDDEN', 'Not your consultation', 403);
  if (c.status !== 'draft') throw new AppError('CONFLICT', 'Consultation is locked', 409);
  c.prescription = c.prescription.filter((p) => p._id.toString() !== req.params.itemId);
  await c.save();
  res.json(c);
});
`;

files['src/controllers/pharmacy.controller.js'] = `import { Consultation } from '../models/Consultation.js';
import { Stock } from '../models/Stock.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

export const queue = asyncHandler(async (req, res) => {
  const items = await Consultation.find({ status: 'completed', 'prescription.dispensed': false })
    .populate('patientId', 'firstName lastName patientId')
    .populate('doctorId', 'name')
    .sort('completedAt');
  res.json(items);
});

export const dispense = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const consultation = await Consultation.findOne({ 'prescription._id': id });
  if (!consultation) throw new AppError('NOT_FOUND', 'Prescription not found', 404);
  const item = consultation.prescription.id(id);
  if (item.dispensed) throw new AppError('CONFLICT', 'Already dispensed', 409);
  const stock = await Stock.findOne({ name: item.drug });
  if (stock) {
    if (stock.stock < 1) throw new AppError('CONFLICT', 'Out of stock', 409);
    stock.stock -= 1;
    await stock.save();
  }
  item.dispensed = true;
  item.dispensedBy = req.user._id;
  item.dispensedAt = new Date();
  const allDispensed = consultation.prescription.every((p) => p.dispensed || p.rejected);
  if (allDispensed) consultation.status = 'dispensed';
  await consultation.save();
  await logAudit({ req, action: 'dispensed_drug', entity: 'consultation', entityId: consultation._id, changes: { itemId: id } });
  res.json(consultation);
});

export const reject = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  if (!reason) throw new AppError('VALIDATION_ERROR', 'reason required', 400);
  const consultation = await Consultation.findOne({ 'prescription._id': id });
  if (!consultation) throw new AppError('NOT_FOUND', 'Prescription not found', 404);
  const item = consultation.prescription.id(id);
  item.rejected = true;
  item.rejectionReason = reason;
  await consultation.save();
  await logAudit({ req, action: 'rejected_prescription', entity: 'consultation', entityId: consultation._id });
  res.json(consultation);
});

export const getStock = asyncHandler(async (req, res) => {
  const items = await Stock.find().sort('name');
  res.json(items);
});

export const reorder = asyncHandler(async (req, res) => {
  const { quantity } = req.body;
  const item = await Stock.findById(req.params.itemId);
  if (!item) throw new AppError('NOT_FOUND', 'Stock item not found', 404);
  item.stock += Number(quantity) || 100;
  item.lastReorderAt = new Date();
  await item.save();
  await logAudit({ req, action: 'reordered_stock', entity: 'stock', entityId: item._id });
  res.json(item);
});

export const checkInteractions = asyncHandler(async (req, res) => {
  const { drugs = [] } = req.body;
  const known = [
    { a: 'warfarin', b: 'aspirin', severity: 'high', note: 'Increased bleeding risk' },
    { a: 'metformin', b: 'alcohol', severity: 'moderate', note: 'Lactic acidosis risk' },
  ];
  const lowered = drugs.map((d) => d.toLowerCase());
  const interactions = known
    .filter((k) => lowered.some((d) => d.includes(k.a)) && lowered.some((d) => d.includes(k.b)))
    .map((k) => ({ drugs: [k.a, k.b], severity: k.severity, note: k.note }));
  res.json({ interactions });
});
`;

files['src/controllers/dashboard.controller.js'] = `import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Consultation } from '../models/Consultation.js';
import { User } from '../models/User.js';
import { Stock } from '../models/Stock.js';
import { AuditLog } from '../models/AuditLog.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const today = () => new Date().toISOString().slice(0, 10);

export const stats = asyncHandler(async (req, res) => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const role = req.user.role;

  if (role === 'doctor') {
    const myAppts = await Appointment.find({ doctorId: req.user._id, date: today() });
    const completed = await Consultation.countDocuments({ doctorId: req.user._id, status: 'completed', updatedAt: { $gte: start } });
    const pending = await Consultation.countDocuments({ doctorId: req.user._id, status: 'draft' });
    return res.json({
      patientsToday: myAppts.length,
      appointmentsToday: myAppts.length,
      pendingConsultations: pending,
      completedConsultations: completed,
      prescriptionsWritten: await Consultation.countDocuments({ doctorId: req.user._id, 'prescription.0': { $exists: true }, updatedAt: { $gte: start } }),
    });
  }

  if (role === 'nurse') {
    return res.json({
      triageQueue: await Appointment.countDocuments({ status: 'checked_in', date: today() }),
      vitalsRecorded: await Consultation.countDocuments({ 'vitals.recordedAt': { $gte: start } }),
      pendingTriage: await Appointment.countDocuments({ status: 'scheduled', date: today() }),
      wardBeds: 24,
    });
  }

  if (role === 'pharmacist') {
    return res.json({
      pendingRx: await Consultation.countDocuments({ status: 'completed', 'prescription.dispensed': false }),
      dispensedToday: await Consultation.countDocuments({ status: 'dispensed', updatedAt: { $gte: start } }),
      lowStock: await Stock.countDocuments({ $expr: { $lt: ['$stock', '$threshold'] } }),
      inventory: await Stock.countDocuments(),
    });
  }

  const [patientsToday, appointmentsToday, pendingConsultations, newRegistrations, staffOnDuty] = await Promise.all([
    Appointment.countDocuments({ date: today() }),
    Appointment.countDocuments({ date: today() }),
    Consultation.countDocuments({ status: 'draft' }),
    Patient.countDocuments({ createdAt: { $gte: start } }),
    User.countDocuments({ isActive: true }),
  ]);
  res.json({ patientsToday, appointmentsToday, pendingConsultations, newRegistrations, staffOnDuty, revenueToday: 0 });
});

export const weeklyVisits = asyncHandler(async (req, res) => {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = await Appointment.countDocuments({ date: key });
    days.push({ date: key, count });
  }
  res.json({ days });
});

export const activity = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 10;
  const logs = await AuditLog.find().populate('actorId', 'name role').sort('-timestamp').limit(limit);
  res.json({
    activity: logs.map((l) => ({
      id: l._id,
      type: l.action,
      message: (l.actorId?.name || 'System') + ' — ' + l.action.replace(/_/g, ' '),
      timestamp: l.timestamp,
      actor: l.actorId ? { id: l.actorId._id, name: l.actorId.name, role: l.actorId.role } : null,
    })),
  });
});
`;

files['src/controllers/users.controller.js'] = `import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

export const list = asyncHandler(async (req, res) => {
  const { role, search, isActive } = req.query;
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive === 'true';
  if (search) filter.$or = [{ name: new RegExp(search, 'i') }, { staffId: new RegExp(search, 'i') }, { email: new RegExp(search, 'i') }];
  const users = await User.find(filter).sort('name');
  res.json(users);
});

export const create = asyncHandler(async (req, res) => {
  const { staffId, email, password, ...rest } = req.body;
  if (!staffId || !email || !password) throw new AppError('VALIDATION_ERROR', 'staffId, email, password required', 400);
  const dup = await User.findOne({ $or: [{ staffId }, { email }] });
  if (dup) throw new AppError('DUPLICATE', 'staffId or email already exists', 409);
  const user = await User.create({ staffId, email, password, ...rest });
  await logAudit({ req, action: 'created_staff', entity: 'user', entityId: user._id });
  res.status(201).json(user);
});

export const update = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  const { password, ...rest } = req.body;
  Object.assign(user, rest);
  await user.save();
  await logAudit({ req, action: 'updated_staff', entity: 'user', entityId: user._id, changes: rest });
  res.json(user);
});

export const remove = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new AppError('NOT_FOUND', 'User not found', 404);
  user.isActive = false;
  await user.save();
  await logAudit({ req, action: 'deactivated_staff', entity: 'user', entityId: user._id });
  res.json({ message: 'User deactivated' });
});

export const updateProfile = asyncHandler(async (req, res) => {
  const { name, email, phone } = req.body;
  if (email && email !== req.user.email) {
    const dup = await User.findOne({ email });
    if (dup) throw new AppError('DUPLICATE', 'Email already in use', 409);
  }
  Object.assign(req.user, { name: name ?? req.user.name, email: email ?? req.user.email, phone: phone ?? req.user.phone });
  await req.user.save();
  res.json(req.user);
});

export const updatePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) throw new AppError('VALIDATION_ERROR', 'Both passwords required', 400);
  const user = await User.findById(req.user._id).select('+password');
  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw new AppError('UNAUTHORIZED', 'Current password incorrect', 401);
  user.password = newPassword;
  await user.save();
  res.json({ message: 'Password updated' });
});

export const revoke = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw new AppError('NOT_FOUND', 'User not found', 404);
  if (target._id.toString() === req.user._id.toString()) throw new AppError('FORBIDDEN', 'Cannot revoke yourself', 403);
  target.isActive = false;
  await target.save();
  await logAudit({ req, action: 'revoked_staff', entity: 'user', entityId: target._id, changes: { reason: req.body.reason } });
  res.json({ message: 'User revoked' });
});
`;

files['src/controllers/settings.controller.js'] = `import { ClinicSettings } from '../models/ClinicSettings.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

export const get = asyncHandler(async (req, res) => {
  let settings = await ClinicSettings.findOne();
  if (!settings) settings = await ClinicSettings.create({});
  res.json(settings);
});

export const update = asyncHandler(async (req, res) => {
  let settings = await ClinicSettings.findOne();
  if (!settings) settings = await ClinicSettings.create({});
  Object.assign(settings, req.body);
  await settings.save();
  await logAudit({ req, action: 'updated_settings', entity: 'clinic_settings', entityId: settings._id, changes: req.body });
  res.json(settings);
});
`;

files['src/controllers/audit.controller.js'] = `import { AuditLog } from '../models/AuditLog.js';
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
`;

files['src/app.js'] = `import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import patientRoutes from './routes/patients.routes.js';
import appointmentRoutes from './routes/appointments.routes.js';
import consultationRoutes from './routes/consultations.routes.js';
import pharmacyRoutes from './routes/pharmacy.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import userRoutes from './routes/users.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: ['http://localhost:5173', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit', auditRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
`;

files['server.js'] = `import app from './src/app.js';
import { connectDB } from './src/config/db.js';

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log('🚀 JajaCare API running on http://localhost:' + PORT + '/api'));
});
`;

files['src/seed.js'] = `import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { User } from './models/User.js';
import { Patient } from './models/Patient.js';
import { Appointment } from './models/Appointment.js';
import { Stock } from './models/Stock.js';
import { ClinicSettings } from './models/ClinicSettings.js';

dotenv.config();

const today = () => new Date().toISOString().slice(0, 10);

const run = async () => {
  await connectDB();
  await Promise.all([
    User.deleteMany({}),
    Patient.deleteMany({}),
    Appointment.deleteMany({}),
    Stock.deleteMany({}),
    ClinicSettings.deleteMany({}),
  ]);
  const users = await User.create([
    { name: 'Admin User',         staffId: 'ADMIN001', email: 'admin@jaja.ui.edu.ng',     password: 'pass', role: 'admin' },
    { name: 'Front Desk Officer', staffId: 'REC001',   email: 'reception@jaja.ui.edu.ng', password: 'pass', role: 'receptionist' },
    { name: 'Nurse Amaka',        staffId: 'NUR001',   email: 'nurse@jaja.ui.edu.ng',     password: 'pass', role: 'nurse' },
    { name: 'Dr. Tunde Adebayo',  staffId: 'DOC001',   email: 'doctor@jaja.ui.edu.ng',    password: 'pass', role: 'doctor', licenseNumber: 'MDCN: 74892' },
    { name: 'Pharm. Tunde Alabi', staffId: 'PHM001',   email: 'pharmacy@jaja.ui.edu.ng',  password: 'pass', role: 'pharmacist' },
  ]);
  const doctor = users.find((u) => u.role === 'doctor');
  const reception = users.find((u) => u.role === 'receptionist');
  const year = new Date().getFullYear();
  const patients = await Patient.create([
    { patientId: 'JC-' + year + '-0001', firstName: 'Oluwaseun', lastName: 'Adeleke', gender: 'male', dateOfBirth: '2005-12-04', phone: '08031234567', address: '14 Bodija Market Road, Ibadan', matricNumber: '214567', faculty: 'Faculty of Science', department: 'Computer Science', hallOfResidence: 'Kuti Hall', emergencyContact: { name: 'Deaconess Folake Adeleke', relationship: 'Mother', phone: '08029876543' }, bloodGroup: 'O+', genotype: 'AA', allergies: ['Penicillin', 'Sulfa Drugs'], chronicConditions: ['Peptic Ulcer'], registeredBy: reception._id },
    { patientId: 'JC-' + year + '-0002', firstName: 'Chioma', lastName: 'Okonkwo', gender: 'female', dateOfBirth: '2003-06-21', phone: '08031234568', matricNumber: '205891', faculty: 'Faculty of Arts', department: 'English', hallOfResidence: 'Queen Amina Hall', bloodGroup: 'A+', genotype: 'AS', allergies: [], chronicConditions: [], registeredBy: reception._id },
    { patientId: 'JC-' + year + '-0003', firstName: 'Ibrahim', lastName: 'Al-Hassan', gender: 'male', dateOfBirth: '2002-09-15', phone: '08031234569', matricNumber: 'ST-8812', faculty: 'Faculty of Engineering', department: 'Mechanical', hallOfResidence: 'Mellamby Hall', bloodGroup: 'B+', genotype: 'AA', allergies: [], chronicConditions: [], registeredBy: reception._id },
  ]);
  await Appointment.create([
    { patientId: patients[0]._id, doctorId: doctor._id, date: today(), timeSlot: '09:00', status: 'scheduled', bookedBy: reception._id },
    { patientId: patients[1]._id, doctorId: doctor._id, date: today(), timeSlot: '09:30', status: 'checked_in', checkedInAt: new Date(), bookedBy: reception._id },
  ]);
  await Stock.create([
    { name: 'Rabeprazole Sodium 20mg', stock: 340, threshold: 50, unit: 'capsules' },
    { name: 'Paracetamol 500mg', stock: 800, threshold: 100, unit: 'tablets' },
    { name: 'Amoxicillin 500mg', stock: 40, threshold: 60, unit: 'capsules' },
    { name: 'Artemether-Lumefantrine', stock: 120, threshold: 50, unit: 'tablets' },
  ]);
  await ClinicSettings.create({});
  console.log('✅ Seed complete');
  console.log('👤 Test logins (password "pass"): ADMIN001, REC001, NUR001, DOC001, PHM001');
  await mongoose.disconnect();
};

run().catch((e) => { console.error(e); process.exit(1); });
`;

// Also make sure .env exists
if (!fs.existsSync('.env')) {
  fs.writeFileSync('.env', [
    'PORT=5000',
    'MONGODB_URI=mongodb://localhost:27017/jajacare',
    'JWT_SECRET=dev-secret-key-change-me-min-32-chars-long',
    'JWT_EXPIRES_IN=15m',
    'JWT_REFRESH_SECRET=dev-refresh-secret-key-change-me-32chars',
    'JWT_REFRESH_EXPIRES_IN=7d',
    'CLIENT_URL=http://localhost:5173',
    'NODE_ENV=development',
    ''
  ].join('\\n'), 'utf8');
  console.log('WROTE: .env');
}

// Also overwrite the broken patients.routes.js just in case
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

let count = 0;
for (const [rel, content] of Object.entries(files)) {
  const full = path.resolve(rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf8');
  console.log('WROTE:', rel);
  count++;
}
console.log('\\nDone. ' + count + ' files written.');
console.log('Now run: npm run dev');
// ===== END fill2.mjs =====
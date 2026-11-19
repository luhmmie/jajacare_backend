import { Appointment } from '../models/Appointment.js';
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
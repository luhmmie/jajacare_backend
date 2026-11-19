import { Consultation } from '../models/Consultation.js';
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
  if (appt.doctorId.toString() !== req.user._id.toString())
    throw new AppError('FORBIDDEN', 'Not your appointment', 403);

  const existing = await Consultation.findOne({ appointmentId });
  if (existing) return res.json(existing);

  const consultation = await Consultation.create({
    appointmentId,
    patientId: appt.patientId,
    doctorId: appt.doctorId,
    status: 'draft',
  });
  appt.status = 'in_consultation';
  await appt.save();
  await logAudit({ req, action: 'started_consultation', entity: 'consultation', entityId: consultation._id });
  res.status(201).json(consultation);
});

export const getOne = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id)
    .populate('patientId')
    .populate('doctorId', 'name');
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  res.json(c);
});

export const update = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id);
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  if (c.doctorId.toString() !== req.user._id.toString())
    throw new AppError('FORBIDDEN', 'Not your consultation', 403);
  if (c.status !== 'draft') throw new AppError('CONFLICT', 'Consultation is locked', 409);

  const body = { ...req.body };
  if (body.vitals) {
    if (body.vitals.weightKg && body.vitals.heightCm)
      body.vitals.bmi = calcBmi(body.vitals.weightKg, body.vitals.heightCm);
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
  if (c.doctorId.toString() !== req.user._id.toString())
    throw new AppError('FORBIDDEN', 'Not your consultation', 403);
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
  const c = await Consultation.findById(req.params.id)
    .populate('patientId')
    .populate('doctorId', 'name');
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  res.json(c);
});

export const addPrescription = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id);
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  if (c.doctorId.toString() !== req.user._id.toString())
    throw new AppError('FORBIDDEN', 'Not your consultation', 403);
  if (c.status !== 'draft') throw new AppError('CONFLICT', 'Consultation is locked', 409);

  const patient = await Patient.findById(c.patientId);
  const allergy = (patient?.allergies || []).find((a) =>
    req.body.drug.toLowerCase().includes(a.toLowerCase())
  );
  if (allergy) {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'Drug allergy detected' },
      warning: 'Drug allergy detected',
    });
  }

  c.prescription.push(req.body);
  await c.save();
  res.json(c);
});

export const removePrescription = asyncHandler(async (req, res) => {
  const c = await Consultation.findById(req.params.id);
  if (!c) throw new AppError('NOT_FOUND', 'Consultation not found', 404);
  if (c.doctorId.toString() !== req.user._id.toString())
    throw new AppError('FORBIDDEN', 'Not your consultation', 403);
  if (c.status !== 'draft') throw new AppError('CONFLICT', 'Consultation is locked', 409);
  c.prescription = c.prescription.filter((p) => p._id.toString() !== req.params.itemId);
  await c.save();
  res.json(c);
});
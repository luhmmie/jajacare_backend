import { Patient } from '../models/Patient.js';
import { Appointment } from '../models/Appointment.js';
import { Consultation } from '../models/Consultation.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

const generatePatientId = async () => {
  const year = new Date().getFullYear();
  const last = await Patient.findOne({ patientId: new RegExp(`^JC-${year}-`) })
    .sort({ patientId: -1 })
    .lean();
  const next = last ? parseInt(last.patientId.split('-')[2], 10) + 1 : 1;
  return `JC-${year}-${String(next).padStart(4, '0')}`;
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
  const patient = await Patient.create({
    ...req.body,
    patientId,
    registeredBy: req.user._id,
  });
  await logAudit({
    req,
    action: 'created_patient',
    entity: 'patient',
    entityId: patient._id,
    changes: { patientId },
  });
  res.status(201).json(patient);
});

export const update = asyncHandler(async (req, res) => {
  const patient = await Patient.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true,
  });
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
import { Consultation } from '../models/Consultation.js';
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
  const { id } = req.params; // prescription itemId
  const consultation = await Consultation.findOne({ 'prescription._id': id });
  if (!consultation) throw new AppError('NOT_FOUND', 'Prescription not found', 404);

  const item = consultation.prescription.id(id);
  if (item.dispensed) throw new AppError('CONFLICT', 'Already dispensed', 409);

  // decrement stock if matching
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
  // Placeholder — integrate a real drug DB later
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
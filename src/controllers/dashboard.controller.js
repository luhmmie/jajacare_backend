import { Patient } from '../models/Patient.js';
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
  const end = new Date();
  end.setHours(23, 59, 59, 999);

  const role = req.user.role;
  const base = {};
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

  // admin / receptionist
  const [patientsToday, appointmentsToday, pendingConsultations, newRegistrations, staffOnDuty] = await Promise.all([
    Appointment.countDocuments({ date: today() }),
    Appointment.countDocuments({ date: today() }),
    Consultation.countDocuments({ status: 'draft' }),
    Patient.countDocuments({ createdAt: { $gte: start } }),
    User.countDocuments({ isActive: true }),
  ]);
  res.json({
    patientsToday,
    appointmentsToday,
    pendingConsultations,
    newRegistrations,
    staffOnDuty,
    revenueToday: 0,
  });
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
      message: `${l.actorId?.name || 'System'} — ${l.action.replace(/_/g, ' ')}`,
      timestamp: l.timestamp,
      actor: l.actorId ? { id: l.actorId._id, name: l.actorId.name, role: l.actorId.role } : null,
    })),
  });
});
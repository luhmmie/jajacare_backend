import mongoose from 'mongoose';

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
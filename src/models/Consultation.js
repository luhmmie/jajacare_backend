import mongoose from 'mongoose';

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
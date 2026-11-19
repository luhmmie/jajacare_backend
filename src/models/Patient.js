import mongoose from 'mongoose';

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
    bloodGroup: {
      type: String,
      enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
    },
    genotype: { type: String, enum: ['AA', 'AS', 'SS', 'AC', 'SC'] },
    allergies: [{ type: String }],
    chronicConditions: [{ type: String }],
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    lastVisit: { type: Date },
    registeredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

patientSchema.index({ firstName: 'text', lastName: 'text', matricNumber: 'text', phone: 'text' });

patientSchema.methods.toJSON = function () {
  const obj = this.toObject();
  obj.id = obj._id.toString();
  delete obj._id;
  delete obj.__v;
  return obj;
};

export const Patient = mongoose.model('Patient', patientSchema);
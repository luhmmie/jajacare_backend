import mongoose from 'mongoose';

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
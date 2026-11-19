import { User } from '../models/User.js';
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

export const listDoctors = asyncHandler(async (req, res) => {
  const doctors = await User.find({ role: 'doctor', isActive: true })
    .select('name staffId email phone licenseNumber');
  res.json(doctors);
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
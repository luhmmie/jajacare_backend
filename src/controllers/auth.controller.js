import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { logAudit } from '../utils/audit.js';

const signAccess = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN });
const signRefresh = (id) =>
  jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN });

export const login = asyncHandler(async (req, res) => {
  const { staffId, password } = req.body;
  if (!staffId || !password) throw new AppError('VALIDATION_ERROR', 'staffId and password required', 400);

  const user = await User.findOne({ staffId }).select('+password');
  if (!user || !user.isActive) throw new AppError('UNAUTHORIZED', 'Invalid credentials', 401);
  const ok = await user.comparePassword(password);
  if (!ok) throw new AppError('UNAUTHORIZED', 'Invalid credentials', 401);

  const token = signAccess(user._id);
  const refreshToken = signRefresh(user._id);
  res.json({ token, refreshToken, user });
});

export const logout = asyncHandler(async (req, res) => {
  res.json({ message: 'Logged out' });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (user) {
    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = crypto.createHash('sha256').update(token).digest('hex');
    user.resetPasswordExpires = Date.now() + 60 * 60 * 1000;
    await user.save({ validateBeforeSave: false });
    // In dev: log token. In prod: email it.
    console.log(`🔑 Password reset token for ${email}: ${token}`);
  }
  res.json({ message: 'If the email exists, a reset link has been sent' });
});

export const resetPassword = asyncHandler(async (req, res) => {
  const { token, newPassword } = req.body;
  if (!token || !newPassword) throw new AppError('VALIDATION_ERROR', 'token and newPassword required', 400);
  const hashed = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    resetPasswordToken: hashed,
    resetPasswordExpires: { $gt: Date.now() },
  });
  if (!user) throw new AppError('UNAUTHORIZED', 'Invalid or expired reset token', 401);
  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ message: 'Password reset successful' });
});

export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new AppError('VALIDATION_ERROR', 'refreshToken required', 400);
  try {
    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) throw new Error('inactive');
    const token = signAccess(user._id);
    res.json({ token });
  } catch {
    throw new AppError('UNAUTHORIZED', 'Invalid refresh token', 401);
  }
});
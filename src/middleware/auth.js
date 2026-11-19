import jwt from 'jsonwebtoken';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'No token provided', 401);
  }
  const token = header.split(' ')[1];
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(payload.id);
    if (!user || !user.isActive) {
      throw new AppError('UNAUTHORIZED', 'User inactive or not found', 401);
    }
    req.user = user;
    next();
  } catch (err) {
    throw new AppError('UNAUTHORIZED', 'Invalid or expired token', 401);
  }
});

export const authorize = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('FORBIDDEN', 'Insufficient permissions', 403));
  }
  next();
};
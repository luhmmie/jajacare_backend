import { Router } from 'express';
import * as c from '../controllers/users.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.patch('/me/profile', c.updateProfile);
r.patch('/me/password', c.updatePassword);
r.get('/doctors', c.listDoctors);
r.get('/', authorize('admin'), c.list);
r.post('/', authorize('admin'), c.create);
r.patch('/:id', authorize('admin'), c.update);
r.delete('/:id', authorize('admin'), c.remove);
r.post('/:id/revoke', authorize('admin'), c.revoke);
export default r;
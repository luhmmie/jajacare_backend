import { Router } from 'express';
import * as c from '../controllers/appointments.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/slots', c.slots);
r.get('/queue', authorize('nurse', 'receptionist', 'doctor', 'admin'), c.queue);
r.get('/', c.list);
r.post('/', authorize('admin', 'receptionist'), c.create);
r.patch('/:id', authorize('admin', 'receptionist', 'nurse', 'doctor'), c.update);
r.post('/:id/checkin', authorize('nurse', 'receptionist'), c.checkin);
export default r;
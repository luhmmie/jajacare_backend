import { Router } from 'express';
import * as c from '../controllers/patients.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/', c.list);
r.get('/:id', c.getOne);
r.get('/:id/history', c.history);
r.post('/', authorize('admin', 'receptionist'), c.create);
r.patch('/:id', authorize('admin', 'receptionist'), c.update);
r.delete('/:id', authorize('admin'), c.remove);
export default r;
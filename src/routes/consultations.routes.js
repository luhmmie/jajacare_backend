import { Router } from 'express';
import * as c from '../controllers/consultations.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.post('/', authorize('doctor'), c.create);
r.get('/:id', authorize('doctor', 'nurse', 'admin'), c.getOne);
r.patch('/:id', authorize('doctor'), c.update);
r.post('/:id/complete', authorize('doctor'), c.complete);
r.get('/:id/print', authorize('doctor', 'nurse', 'admin'), c.printable);
r.post('/:id/prescription', authorize('doctor'), c.addPrescription);
r.delete('/:id/prescription/:itemId', authorize('doctor'), c.removePrescription);
export default r;
import { Router } from 'express';
import * as c from '../controllers/pharmacy.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/queue', authorize('pharmacist', 'admin'), c.queue);
r.post('/dispense/:id', authorize('pharmacist'), c.dispense);
r.post('/reject/:id', authorize('pharmacist'), c.reject);
r.get('/stock', authorize('pharmacist', 'admin'), c.getStock);
r.post('/reorder/:itemId', authorize('pharmacist', 'admin'), c.reorder);
r.post('/check-interactions', authorize('pharmacist'), c.checkInteractions);
export default r;
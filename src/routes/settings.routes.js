import { Router } from 'express';
import * as c from '../controllers/settings.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/clinic', c.get);
r.patch('/clinic', authorize('admin'), c.update);
export default r;
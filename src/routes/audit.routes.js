import { Router } from 'express';
import * as c from '../controllers/audit.controller.js';
import { authenticate, authorize } from '../middleware/auth.js';

const r = Router();
r.use(authenticate, authorize('admin'));
r.get('/', c.list);
export default r;
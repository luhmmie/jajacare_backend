import { Router } from 'express';
import * as c from '../controllers/dashboard.controller.js';
import { authenticate } from '../middleware/auth.js';

const r = Router();
r.use(authenticate);
r.get('/stats', c.stats);
r.get('/weekly-visits', c.weeklyVisits);
r.get('/activity', c.activity);
export default r;
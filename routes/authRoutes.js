import { Router } from 'express';
import * as c from '../controllers/auth.controller.js';
import { authenticate } from '../middleware/auth.js';

const r = Router();
r.post('/login', c.login);
r.post('/logout', authenticate, c.logout);
r.get('/me', authenticate, c.me);
r.post('/forgot-password', c.forgotPassword);
r.post('/reset-password', c.resetPassword);
r.post('/refresh', c.refresh);
export default r;
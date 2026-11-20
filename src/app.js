import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import authRoutes from './routes/auth.routes.js';
import patientRoutes from './routes/patients.routes.js';
import appointmentRoutes from './routes/appointments.routes.js';
import consultationRoutes from './routes/consultations.routes.js';
import pharmacyRoutes from './routes/pharmacy.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import userRoutes from './routes/users.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import auditRoutes from './routes/audit.routes.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://jajacare.vercel.app',
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());

app.get('/api/health', (req, res) => res.json({ ok: true }));

app.use('/api/auth', authRoutes);
app.use('/api/patients', patientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/consultations', consultationRoutes);
app.use('/api/pharmacy', pharmacyRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/users', userRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/audit', auditRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;

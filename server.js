import app from './src/app.js';
import { connectDB } from './src/config/db.js';
import cors from 'cors';

const PORT = process.env.PORT || 5000;

connectDB().then(() => {
  app.listen(PORT, () => console.log(` JajaCare API running on http://localhost:${PORT}/api`));
});

app.use(cors({
  origin: [
    'http://localhost:5173',
    'https://jajacare.vercel.app',
  ],
  credentials: true,
}));

// jajacare-backend/server.js
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const User = require('./models/User'); // Import the model

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// --- DATABASE CONNECTION ---
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/jajacare')
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch((err) => console.error('❌ MongoDB connection error:', err));

// --- SEED DEMO USERS (Runs once on startup if DB is empty) ---
async function seedDatabase() {
  try {
    const count = await User.countDocuments();
    if (count === 0) {
      console.log('Seeding demo users...');
      await User.create([
        { name: 'Admin User', staffId: 'ADMIN001', email: 'admin@jaja.ui.edu.ng', role: 'admin', password: 'pass' },
        { name: 'Front Desk', staffId: 'REC001', email: 'rec@jaja.ui.edu.ng', role: 'receptionist', password: 'pass' },
        { name: 'Nurse Amaka', staffId: 'NUR001', email: 'nurse@jaja.ui.edu.ng', role: 'nurse', password: 'pass' },
        { name: 'Dr. Tunde', staffId: 'DOC001', email: 'doctor@jaja.ui.edu.ng', role: 'doctor', password: 'pass' },
        { name: 'Pharm. Tobi', staffId: 'PHM001', email: 'pharmacy@jaja.ui.edu.ng', role: 'pharmacist', password: 'pass' },
        { name: 'Oluwaseun Adeleke', staffId: '214567', email: 'student@ui.edu.ng', role: 'patient', password: 'pass' }
      ]);
      console.log('✅ Demo users seeded successfully');
    }
  } catch (error) {
    console.error('Error seeding database:', error);
  }
}
seedDatabase();

// --- ROUTES ---

// 1. Health Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'success', message: 'Backend is running with MongoDB!' });
});

// 2. Login Endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { staffId, password } = req.body;

    // Find user by staffId or email
    const user = await User.findOne({ 
      $or: [{ staffId: staffId }, { email: staffId }] 
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ error: { message: 'Incorrect ID or password' } });
    }

    // Check password
    const isMatch = await user.matchPassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: { message: 'Incorrect ID or password' } });
    }

    // Generate fake token for now (JWT can be added later)
    const token = `fake-jwt-token-${user._id}`;
    
    // Convert to object and remove password
    const userObject = user.toObject();
    delete userObject.password;
    
    // Map _id to id for frontend compatibility
    userObject.id = userObject._id;

    res.json({ token, user: userObject });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { message: 'Server error' } });
  }
});

// 3. Patient Registration Endpoint
app.post('/api/auth/register-patient', async (req, res) => {
  try {
    const { firstName, lastName, matricNumber, email, phone, password } = req.body;

    // Check if user exists
    const existing = await User.findOne({ 
      $or: [{ email }, { staffId: matricNumber }] 
    });

    if (existing) {
      return res.status(409).json({ error: { message: 'Email or matric number already exists' } });
    }

    // Create user
    const user = await User.create({
      name: `${firstName} ${lastName}`,
      staffId: matricNumber,
      email,
      phone,
      password,
      role: 'patient'
    });

    const token = `fake-jwt-token-${user._id}`;
    const userObject = user.toObject();
    delete userObject.password;
    userObject.id = userObject._id;

    res.status(201).json({ token, user: userObject });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: { message: 'Server error' } });
  }
});

// --- START SERVER ---
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});
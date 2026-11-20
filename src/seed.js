import dns from 'node:dns';
dns.setServers(['8.8.8.8', '1.1.1.1']);

import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import { User } from './models/User.js';
import { Patient } from './models/Patient.js';
import { Appointment } from './models/Appointment.js';
import { Stock } from './models/Stock.js';
import { ClinicSettings } from './models/ClinicSettings.js';

dotenv.config();

const today = () => new Date().toISOString().slice(0, 10);

const run = async () => {
  await connectDB();
  await Promise.all([
    User.deleteMany({}),
    Patient.deleteMany({}),
    Appointment.deleteMany({}),
    Stock.deleteMany({}),
    ClinicSettings.deleteMany({}),
  ]);

  const users = await User.create([
    { name: 'Admin User',         staffId: 'ADMIN001', email: 'admin@jaja.ui.edu.ng',     password: 'pass', role: 'admin' },
    { name: 'Front Desk Officer', staffId: 'REC001',   email: 'reception@jaja.ui.edu.ng', password: 'pass', role: 'receptionist' },
    { name: 'Nurse Amaka',        staffId: 'NUR001',   email: 'nurse@jaja.ui.edu.ng',     password: 'pass', role: 'nurse' },
    { name: 'Dr. Tunde Adebayo',  staffId: 'DOC001',   email: 'doctor@jaja.ui.edu.ng',    password: 'pass', role: 'doctor', licenseNumber: 'MDCN: 74892' },
    { name: 'Pharm. Tunde Alabi', staffId: 'PHM001',   email: 'pharmacy@jaja.ui.edu.ng',  password: 'pass', role: 'pharmacist' },
  ]);

  const doctor = users.find((u) => u.role === 'doctor');
  const reception = users.find((u) => u.role === 'receptionist');

  const year = new Date().getFullYear();
  const patients = await Patient.create([
    {
      patientId: `JC-${year}-0001`, firstName: 'Oluwaseun', lastName: 'Adeleke',
      gender: 'male', dateOfBirth: '2005-12-04', phone: '08031234567',
      address: '14 Bodija Market Road, Ibadan', matricNumber: '214567',
      faculty: 'Faculty of Science', department: 'Computer Science', hallOfResidence: 'Kuti Hall',
      emergencyContact: { name: 'Deaconess Folake Adeleke', relationship: 'Mother', phone: '08029876543' },
      bloodGroup: 'O+', genotype: 'AA', allergies: ['Penicillin', 'Sulfa Drugs'], chronicConditions: ['Peptic Ulcer'],
      registeredBy: reception._id,
    },
    {
      patientId: `JC-${year}-0002`, firstName: 'Chioma', lastName: 'Okonkwo',
      gender: 'female', dateOfBirth: '2003-06-21', phone: '08031234568',
      matricNumber: '205891', faculty: 'Faculty of Arts', department: 'English', hallOfResidence: 'Queen Amina Hall',
      bloodGroup: 'A+', genotype: 'AS', allergies: [], chronicConditions: [], registeredBy: reception._id,
    },
    {
      patientId: `JC-${year}-0003`, firstName: 'Ibrahim', lastName: 'Al-Hassan',
      gender: 'male', dateOfBirth: '2002-09-15', phone: '08031234569',
      matricNumber: 'ST-8812', faculty: 'Faculty of Engineering', department: 'Mechanical', hallOfResidence: 'Mellamby Hall',
      bloodGroup: 'B+', genotype: 'AA', allergies: [], chronicConditions: [], registeredBy: reception._id,
    },
  ]);

  await Appointment.create([
    { patientId: patients[0]._id, doctorId: doctor._id, date: today(), timeSlot: '09:00', status: 'scheduled', bookedBy: reception._id },
    { patientId: patients[1]._id, doctorId: doctor._id, date: today(), timeSlot: '09:30', status: 'checked_in', checkedInAt: new Date(), bookedBy: reception._id },
  ]);

  await Stock.create([
    { name: 'Rabeprazole Sodium 20mg', stock: 340, threshold: 50, unit: 'capsules' },
    { name: 'Paracetamol 500mg',       stock: 800, threshold: 100, unit: 'tablets' },
    { name: 'Amoxicillin 500mg',       stock: 40,  threshold: 60,  unit: 'capsules' },
    { name: 'Artemether-Lumefantrine', stock: 120, threshold: 50,  unit: 'tablets' },
  ]);

  await ClinicSettings.create({});

  console.log('✅ Seed complete');
  console.log('👤 Test logins (password "pass"): ADMIN001, REC001, NUR001, DOC001, PHM001');
  await mongoose.disconnect();
};

run().catch((e) => { console.error(e); process.exit(1); });

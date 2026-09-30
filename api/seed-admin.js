const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'password';

async function seedAdmin() {
  try {
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/patho-connect';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB');

    const existing = await User.findOne({ role: 'Admin' });
    if (existing) {
      console.log(`An Admin user already exists: ${existing.email} — nothing to do.`);
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
    const admin = new User({
      email: ADMIN_EMAIL,
      password: hashedPassword,
      name: 'Admin',
      role: 'Admin',
    });

    const result = await admin.save();
    console.log(`Created Admin user: ${ADMIN_EMAIL} with ID: ${result._id}`);
    console.log(`Login with: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
    process.exit(0);
  } catch (error) {
    console.error('Error seeding admin user:', error);
    process.exit(1);
  }
}

seedAdmin();

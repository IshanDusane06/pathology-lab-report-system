const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

async function seedTestUser() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/patho-connect';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB');

    // Clear existing test user
    await User.deleteOne({ email: 'test@example.com' });
    console.log('Cleared existing test user if present');

    // Create test user
    // const testUser = {
    //   email: 'test@example.com',
    //   password: 'test123',
    //   name: 'Test User',
    //   role: 'Doctor',
    //   profile: {
    //     specialization: 'Test',
    //     qualification: 'Test',
    //     contactNumber: '+1234567890',
    //     address: 'Test Address'
    //   }
    // };

    const testUser = {
        email: 'ishan@example.com',
        password: 'test123',
        name: 'Ishan Dusane',
        role: 'Doctor',
        profile: {
          specialization: 'Test',
          qualification: 'Test',
          contactNumber: '+1234567890',
          address: 'Test Address'
        }
      };

    console.log('Hashing password for test user');
    const hashedPassword = await bcrypt.hash(testUser.password, 10);
    
    const newUser = new User({
      ...testUser,
      password: hashedPassword
    });
    
    const result = await newUser.save();
    console.log(`Created test user: ${testUser.email} with ID: ${result._id}`);
    console.log('Password hash:', hashedPassword);

    console.log('Test user seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding test user:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

seedTestUser();

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const User = require('./models/User');

console.log('Using MongoDB URI:', process.env.MONGODB_URI);

const mockUsers = [
  {
    email: 'doctor@example.com',
    password: 'password',
    name: 'Dr. John Smith',
    role: 'Doctor',
    profile: {
      specialization: 'Pathology',
      qualification: 'MBBS, MD',
      contactNumber: '+1234567890',
      address: '123 Medical Street',
    }
  },
  {
    email: 'tech@example.com',
    password: 'password',
    name: 'Alex Johnson',
    role: 'Technician'
  }
];

async function seedDatabase() {
  try {
    // Connect to MongoDB with detailed options
    await mongoose.connect(process.env.MONGODB_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000,
    });
    console.log('Connected to MongoDB');
    
    // Verify connection
    const db = mongoose.connection;
    console.log('Database name:', db.name);
    console.log('Database host:', db.host);
    console.log('Database port:', db.port);

    // Clear existing users
    await User.deleteMany({});
    console.log('Cleared existing users');

    // Create users
    for (const user of mockUsers) {
      console.log('Hashing password for:', user.email);
      const hashedPassword = await bcrypt.hash(user.password, 10);
      
      const newUser = new User({
        ...user,
        password: hashedPassword
      });
      
      const result = await newUser.save();
      console.log(`Created user: ${user.email} with ID: ${result._id}`);
    }

    console.log('Database seeding completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error seeding database:', error);
    console.error('Error stack:', error.stack);
    process.exit(1);
  }
}

seedDatabase();

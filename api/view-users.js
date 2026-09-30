const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('./models/User');

async function viewUsers() {
  try {
    console.log('Connecting to MongoDB...');
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/patho-connect';
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log('Connected to MongoDB');

    console.log('\nFinding all users...');
    const users = await User.find().select('-password'); // Don't show passwords
    
    console.log('\nUsers in database:');
    users.forEach((user, index) => {
      console.log(`\nUser ${index + 1}:`);
      console.log('ID:', user._id);
      console.log('Email:', user.email);
      console.log('Name:', user.name);
      console.log('Role:', user.role);
      console.log('Created At:', user.createdAt);
      console.log('Last Login:', user.lastLogin);
    });

    console.log('\nTotal users:', users.length);
    process.exit(0);
  } catch (error) {
    console.error('Error viewing users:', error);
    process.exit(1);
  }
}

viewUsers();

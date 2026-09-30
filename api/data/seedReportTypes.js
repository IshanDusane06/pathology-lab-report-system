const mongoose = require('mongoose');
const ReportType = require('../models/ReportType');

// Sample report types
const sampleReportTypes = [
  {
    name: 'Complete Blood Count (CBC)',
    code: 'CBC',
    description: 'A comprehensive blood test that measures various components of blood',
    isActive: true,
    parameters: [
      {
        name: 'Hemoglobin',
        description: 'Measures the amount of oxygen-carrying protein in the blood',
        unit: 'g/dL',
        type: 'number',
        isRequired: true,
        displayOrder: 1,
        section: 'main',
        normalValues: [
          {
            min: 12.0,
            max: 16.0,
            unit: 'g/dL',
            gender: 'female',
            ageRange: { min: 18, max: 100 }
          },
          {
            min: 13.8,
            max: 17.2,
            unit: 'g/dL',
            gender: 'male',
            ageRange: { min: 18, max: 100 }
          }
        ]
      },
      {
        name: 'White Blood Cell Count',
        description: 'Measures the number of white blood cells',
        unit: 'cells/µL',
        type: 'number',
        isRequired: true,
        displayOrder: 2,
        section: 'main',
        normalValues: [
          {
            min: 4.0,
            max: 11.0,
            unit: 'cells/µL',
            gender: 'all',
            ageRange: { min: 18, max: 100 }
          }
        ]
      },
      {
        name: 'Platelet Count',
        description: 'Measures the number of platelets in the blood',
        unit: 'cells/µL',
        type: 'number',
        isRequired: true,
        displayOrder: 3,
        section: 'main',
        normalValues: [
          {
            min: 150,
            max: 450,
            unit: 'cells/µL',
            gender: 'all',
            ageRange: { min: 18, max: 100 }
          }
        ]
      }
    ]
  },
  {
    name: 'Liver Function Test (LFT)',
    code: 'LFT',
    description: 'Tests to evaluate liver function and detect liver disease',
    isActive: true,
    parameters: [
      {
        name: 'ALT',
        description: 'Alanine transaminase enzyme',
        unit: 'U/L',
        type: 'number',
        isRequired: true,
        displayOrder: 1,
        section: 'main',
        normalValues: [
          {
            min: 0,
            max: 40,
            unit: 'U/L',
            gender: 'all',
            ageRange: { min: 18, max: 100 }
          }
        ]
      },
      {
        name: 'AST',
        description: 'Aspartate transaminase enzyme',
        unit: 'U/L',
        type: 'number',
        isRequired: true,
        displayOrder: 2,
        section: 'main',
        normalValues: [
          {
            min: 0,
            max: 40,
            unit: 'U/L',
            gender: 'all',
            ageRange: { min: 18, max: 100 }
          }
        ]
      },
      {
        name: 'Bilirubin',
        description: 'Measures bilirubin levels in blood',
        unit: 'mg/dL',
        type: 'number',
        isRequired: true,
        displayOrder: 3,
        section: 'main',
        normalValues: [
          {
            min: 0.1,
            max: 1.2,
            unit: 'mg/dL',
            gender: 'all',
            ageRange: { min: 18, max: 100 }
          }
        ]
      }
    ]
  }
];

async function seedData() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/patho-connect');
    console.log('Connected to MongoDB');

    // Delete existing report types
    await ReportType.deleteMany({});
    console.log('Cleared existing report types');

    // Insert sample report types
    const result = await ReportType.insertMany(sampleReportTypes);
    console.log(`Inserted ${result.length} report types`);

    console.log('Seeding complete');
  } catch (error) {
    console.error('Error seeding data:', error);
  } finally {
    // Close the connection
    await mongoose.connection.close();
  }
}

seedData();

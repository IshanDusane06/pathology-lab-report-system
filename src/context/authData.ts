export const MOCK_USERS = [
  {
    id: '1',
    email: 'doctor@example.com',
    password: 'password',
    name: 'Dr. John Smith',
    role: 'Doctor' as const,
    profile: {
      specialization: 'Pathology',
      qualification: 'MBBS, MD',
      contactNumber: '+1234567890',
      address: '123 Medical Street',
    }
  },
  {
    id: '2',
    email: 'tech@example.com',
    password: 'password',
    name: 'Alex Johnson',
    role: 'Technician' as const,
  },
];

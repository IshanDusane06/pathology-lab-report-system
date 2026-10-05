const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

// Middleware
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests from both frontend ports
    if (!origin || origin === 'http://localhost:5173' || origin === 'http://localhost:8080') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}

app.use(cors(corsOptions));
app.use(express.json());

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Import routes
const reportsRoutes = require('./routes/reports');
const authRoutes = require('./routes/auth');
const reportTypesRoutes = require('./routes/reportTypes');
const usersRoutes = require('./routes/users');
const auditRoutes = require('./routes/audit');
const labSettingsRoutes = require('./routes/labSettings');
const patientsRoutes = require('./routes/patients');
const eventsRoutes = require('./routes/events');

// Use routes
app.use('/api/reports', reportsRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/report-types', reportTypesRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/lab-settings', labSettingsRoutes);
app.use('/api/patients', patientsRoutes);
app.use('/api/events', eventsRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Something went wrong',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 5001;
const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Background job queue (report email/PDF rendering, signature
// re-verification) and the SSE push that reports job completion. Both are
// optional at the Express-route level — enqueue routes degrade to a 503 if
// Redis is unreachable — but are started here so a healthy boot has them
// ready immediately.
const { pingRedis } = require('./queue/connection');
const { subscribeJobEvents } = require('./events/publisher');
const { startWorkers, stopWorkers } = require('./queue/worker');
const hub = require('./events/hub');

pingRedis()
  .then(() => {
    console.log('Connected to Redis');
    subscribeJobEvents();
    if (process.env.RUN_WORKER_INLINE !== 'false') {
      startWorkers();
    }
  })
  .catch((err) => {
    console.error(
      'Redis is unreachable — report email/PDF and signature re-verification will return 503 until it is:',
      err.message
    );
  });

async function shutdown() {
  console.log('Shutting down...');
  hub.closeAll();
  await stopWorkers().catch(() => {});
  server.close(() => process.exit(0));
  // Force-exit if close() hangs on an open connection somewhere.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

module.exports = app;

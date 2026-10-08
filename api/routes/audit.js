const express = require('express');
const router = express.Router();
const AuditLog = require('../models/AuditLog');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { parsePagination } = require('../utils/pagination');


// List audit events (Admin only) — paginated, newest first, optional category filter.
router.get('/', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const filter = {};
    if (req.query.category) filter.category = req.query.category;

    const [events, total] = await Promise.all([
      AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      AuditLog.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: events,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('Error fetching audit log:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch audit log'
    });
  }
});

module.exports = router;

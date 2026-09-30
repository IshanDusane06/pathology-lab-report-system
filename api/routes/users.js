const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isAuthenticated, isAdmin } = require('../middleware/auth');
const { generateTempPassword } = require('../utils/tempPassword');
const { logEvent } = require('../utils/auditLog');

function parsePagination(req) {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 20));
  return { page, limit, skip: (page - 1) * limit };
}

// Create a user (Admin only). If `password` is omitted, a temp password is
// generated and returned exactly once in the response — only its hash is
// ever persisted (via User's pre-save hook).
router.post('/', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    if (!name || !email || !role) {
      return res.status(400).json({
        success: false,
        message: 'name, email, and role are required'
      });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'A user with this email already exists'
      });
    }

    const tempPassword = password || generateTempPassword();
    const newUser = new User({
      name,
      email,
      password: tempPassword,
      role,
      mustChangePassword: !password,
    });
    await newUser.save();

    await logEvent({
      actor: req.user,
      action: 'user.create',
      category: 'Access',
      description: `Invited ${email} as ${role.toLowerCase()}`,
      targetType: 'User',
      targetId: newUser._id,
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive,
        ...(password ? {} : { tempPassword }),
      }
    });
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create user'
    });
  }
});

// List users (Admin only) — paginated, with role/status/search/neverSignedIn filters.
router.get('/', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req);
    const filter = {};

    if (req.query.role) filter.role = req.query.role;
    if (req.query.status === 'active') filter.isActive = true;
    if (req.query.status === 'suspended') filter.isActive = false;
    if (req.query.neverSignedIn === 'true') filter.lastLogin = null;
    if (req.query.search) {
      const re = new RegExp(req.query.search.trim(), 'i');
      filter.$or = [{ name: re }, { email: re }];
    }

    const [users, total] = await Promise.all([
      User.find(filter).select('-password').sort({ name: 1 }).skip(skip).limit(limit),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: users,
      pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users'
    });
  }
});

// Get a single user (Admin only)
router.get('/:id', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    res.json({ success: true, data: user });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user'
    });
  }
});

// Update a user — role changes, isActive toggle (soft-delete, same convention
// as ReportType). Password changes are deliberately excluded: they need to go
// through User's pre-save bcrypt hook, which findByIdAndUpdate bypasses (see
// POST /:id/reset-password for the real password-change path).
router.put('/:id', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const updates = { ...req.body };
    delete updates.password;
    delete updates._id;

    const before = await User.findById(req.params.id).select('-password');
    if (!before) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const updatedUser = await User.findByIdAndUpdate(req.params.id, updates, {
      new: true,
      runValidators: true
    }).select('-password');

    if ('role' in updates && updates.role !== before.role) {
      await logEvent({
        actor: req.user,
        action: 'user.roleChange',
        category: 'Access',
        description: `Changed role of ${before.name} from ${before.role.toLowerCase()} to ${updates.role.toLowerCase()}`,
        targetType: 'User',
        targetId: updatedUser._id,
      });
    }
    if ('isActive' in updates && updates.isActive !== before.isActive) {
      await logEvent({
        actor: req.user,
        action: updates.isActive ? 'user.restore' : 'user.suspend',
        category: 'Access',
        description: updates.isActive
          ? `Restored access for ${before.name}`
          : `Suspended ${before.name}`,
        targetType: 'User',
        targetId: updatedUser._id,
      });
    }

    res.json({ success: true, message: 'User updated successfully', data: updatedUser });
  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update user'
    });
  }
});

// Admin-initiated password reset — generates a new temp password, returns it
// once, persists only its hash. Goes through .save() (not findByIdAndUpdate)
// so the pre-save bcrypt hook actually runs.
router.post('/:id/reset-password', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const tempPassword = generateTempPassword();
    user.password = tempPassword;
    user.mustChangePassword = true;
    await user.save();

    await logEvent({
      actor: req.user,
      action: 'user.resetPassword',
      category: 'Access',
      description: `Reset password for ${user.name}`,
      targetType: 'User',
      targetId: user._id,
    });

    res.json({ success: true, message: 'Password reset', data: { tempPassword } });
  } catch (error) {
    console.error('Error resetting password:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset password'
    });
  }
});

// Delete a user — only ever an "awaiting first sign-in" invite that was never
// used. A user who has actually logged in is never hard-deleted through this
// path; suspend (PUT /:id { isActive: false }) is the correct tool there.
router.delete('/:id', [isAuthenticated, isAdmin], async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    if (user.lastLogin) {
      return res.status(400).json({
        success: false,
        message: 'This user has already signed in — suspend the account instead of deleting it.'
      });
    }

    await User.findByIdAndDelete(req.params.id);

    await logEvent({
      actor: req.user,
      action: 'user.delete',
      category: 'Access',
      description: `Deleted invite for ${user.email}`,
      targetType: 'User',
      targetId: user._id,
    });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user'
    });
  }
});

module.exports = router;

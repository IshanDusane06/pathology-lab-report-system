
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Role constants
const ROLES = {
  DOCTOR: 'Doctor',
  TECHNICIAN: 'Technician',
  ADMIN: 'Admin'
};

// Role hierarchy (higher index means higher privilege)
const ROLE_HIERARCHY = [ROLES.TECHNICIAN, ROLES.DOCTOR, ROLES.ADMIN];

// Middleware to check if the user is authenticated
exports.isAuthenticated = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'No authentication token, access denied'
      });
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Find user by id
    const user = await User.findById(decoded.id);
    
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    res.status(401).json({
      success: false,
      message: 'Invalid token, authentication failed'
    });
  }
};

// Middleware to check if user has required role or higher
exports.hasRoleOrHigher = (requiredRole) => {
  return async (req, res, next) => {
    const userRoleIndex = ROLE_HIERARCHY.indexOf(req.user.role);
    const requiredRoleIndex = ROLE_HIERARCHY.indexOf(requiredRole);
    
    if (userRoleIndex === -1 || requiredRoleIndex === -1) {
      return res.status(403).json({
        success: false,
        message: 'Invalid role configuration'
      });
    }
    
    if (userRoleIndex < requiredRoleIndex) {
      return res.status(403).json({
        success: false,
        message: `Access denied, ${requiredRole.toLowerCase()} role or higher required`
      });
    }
    
    next();
  };
};

// Middleware to check if user has specific role
exports.hasRole = (requiredRole) => {
  return async (req, res, next) => {
    if (req.user.role !== requiredRole) {
      return res.status(403).json({
        success: false,
        message: `Access denied, ${requiredRole.toLowerCase()} role required`
      });
    }
    next();
  };
};

// Convenience middleware functions
exports.isDoctor = exports.hasRole(ROLES.DOCTOR);
exports.isTechnician = exports.hasRole(ROLES.TECHNICIAN);
exports.isAdmin = exports.hasRole(ROLES.ADMIN);

// Middleware to check if user has specific permission
exports.hasPermission = (permission) => {
  return async (req, res, next) => {
    if (!req.user.permissions?.[permission]) {
      return res.status(403).json({
        success: false,
        message: `Access denied, ${permission} permission required`
      });
    }
    next();
  };
};

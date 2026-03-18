// src/middlewares/auth.js

const jwt  = require('jsonwebtoken');
const prisma = require('../config/prisma');
const { error } = require('../utils/helpers');

const protect = async (req, res, next) => {
  try {
    let token;
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    if (!token) return error(res, 'Access denied. Please log in.', 401);

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true, fullname: true, email: true, phone: true,
        role: true, isFrozen: true, isVerified: true, pinSet: true,
      },
    });

    if (!user)      return error(res, 'User no longer exists.', 401);
    if (user.isFrozen) return error(res, 'Account is frozen. Contact support.', 403);

    req.user = user;
    next();
  } catch {
    return error(res, 'Invalid or expired token.', 401);
  }
};

const requireVerified = (req, res, next) => {
  if (!req.user.isVerified) {
    return error(res, 'Please verify your email address to continue.', 403);
  }
  next();
};

const adminOnly = (req, res, next) => {
  if (req.user.role !== 'ADMIN') return error(res, 'Admin access required.', 403);
  next();
};

module.exports = { protect, requireVerified, adminOnly };

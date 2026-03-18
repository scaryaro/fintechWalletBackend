// src/controllers/authController.js

const bcrypt  = require('bcryptjs');
const jwt     = require('jsonwebtoken');
const prisma  = require('../config/prisma');
const EmailService = require('../services/emailService');
const {
  generateOTP, generateAccountNumber, otpExpiry,
  hashToken, success, error,
} = require('../utils/helpers');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });

// ── POST /api/auth/register ───────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { fullname, email, phone, password, bvn } = req.body;

    // Check duplicates
    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { phone }] },
    });
    if (existing) {
      const field = existing.email === email ? 'Email' : 'Phone number';
      return error(res, `${field} already registered.`, 409);
    }

    const hashed = await bcrypt.hash(password, 12);

    // Generate unique account number
    let accountNumber;
    let unique = false;
    while (!unique) {
      accountNumber = generateAccountNumber();
      const exists = await prisma.bankAccount.findUnique({ where: { accountNumber } });
      if (!exists) unique = true;
    }

    // Create user + wallet + bank account in one transaction
    const user = await prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { fullname, email, phone, password: hashed, bvn: bvn || null },
      });
      await tx.wallet.create({ data: { userId: u.id } });
      await tx.bankAccount.create({
        data: {
          userId: u.id,
          accountNumber,
          accountName: fullname,
          bankName: process.env.BANK_NAME || 'Fintech Bank',
        },
      });
      return u;
    });

    // Send verification OTP
    const otp   = generateOTP();
    const token = require('crypto').randomBytes(32).toString('hex');
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: otp,
        type: 'EMAIL_VERIFICATION',
        token: hashToken(token),
        expiresAt: otpExpiry(10),
      },
    });

    EmailService.sendVerificationEmail(user, otp, token).catch(() => {});

    const authToken = signToken(user.id);
    return success(res, {
      token: authToken,
      user: { id: user.id, fullname, email, phone, isVerified: false },
      account: { accountNumber, bankName: process.env.BANK_NAME || 'Fintech Bank' },
      message: 'Registration successful! Please verify your email.',
    }, 'Registered', 201);
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/login ──────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return error(res, 'Invalid email or password.', 401);

    const match = await bcrypt.compare(password, user.password);
    if (!match) return error(res, 'Invalid email or password.', 401);

    if (user.isFrozen) return error(res, 'Account is frozen. Contact support.', 403);

    // Update last login
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = signToken(user.id);
    return success(res, {
      token,
      user: {
        id: user.id, fullname: user.fullname, email: user.email,
        phone: user.phone, role: user.role, isVerified: user.isVerified,
      },
    }, 'Login successful.');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/verify-email ───────────────────────────────
const verifyEmail = async (req, res, next) => {
  try {
    const { otp, token, email } = req.body;

    let otpRecord;

    if (token) {
      // Via link
      const hashed = hashToken(token);
      otpRecord = await prisma.oTP.findFirst({
        where: { token: hashed, type: 'EMAIL_VERIFICATION', used: false },
        include: { user: true },
      });
    } else if (otp && email) {
      // Via OTP code
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return error(res, 'User not found.', 404);
      otpRecord = await prisma.oTP.findFirst({
        where: { userId: user.id, code: otp, type: 'EMAIL_VERIFICATION', used: false },
        include: { user: true },
      });
    } else {
      return error(res, 'Provide OTP or verification token.', 400);
    }

    if (!otpRecord)                         return error(res, 'Invalid or expired code.', 400);
    if (new Date() > otpRecord.expiresAt)  return error(res, 'Verification code has expired. Please request a new one.', 400);
    if (otpRecord.user.isVerified)         return success(res, {}, 'Email already verified.');

    await prisma.$transaction([
      prisma.user.update({ where: { id: otpRecord.userId }, data: { isVerified: true } }),
      prisma.oTP.update({ where: { id: otpRecord.id }, data: { used: true } }),
    ]);

    EmailService.sendWelcomeEmail(
      otpRecord.user,
      (await prisma.bankAccount.findUnique({ where: { userId: otpRecord.userId } }))?.accountNumber
    ).catch(() => {});

    return success(res, {}, 'Email verified successfully! You can now log in.');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/resend-otp ─────────────────────────────────
const resendOTP = async (req, res, next) => {
  try {
    const { email, type = 'EMAIL_VERIFICATION' } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return error(res, 'User not found.', 404);

    if (type === 'EMAIL_VERIFICATION' && user.isVerified) {
      return error(res, 'Email already verified.', 400);
    }

    // Invalidate old OTPs
    await prisma.oTP.updateMany({
      where: { userId: user.id, type, used: false },
      data: { used: true },
    });

    const otp   = generateOTP();
    const token = require('crypto').randomBytes(32).toString('hex');
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: otp,
        type,
        token: hashToken(token),
        expiresAt: otpExpiry(10),
      },
    });

    if (type === 'EMAIL_VERIFICATION') {
      EmailService.sendVerificationEmail(user, otp, token).catch(() => {});
    } else {
      EmailService.sendPasswordResetEmail(user, otp, token).catch(() => {});
    }

    return success(res, {}, 'A new code has been sent to your email.');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/forgot-password ────────────────────────────
const forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    // Always return success to prevent email enumeration
    if (!user) return success(res, {}, 'If that email exists, a reset link has been sent.');

    await prisma.oTP.updateMany({
      where: { userId: user.id, type: 'PASSWORD_RESET', used: false },
      data: { used: true },
    });

    const otp   = generateOTP();
    const token = require('crypto').randomBytes(32).toString('hex');
    await prisma.oTP.create({
      data: {
        userId: user.id,
        code: otp,
        type: 'PASSWORD_RESET',
        token: hashToken(token),
        expiresAt: otpExpiry(10),
      },
    });

    EmailService.sendPasswordResetEmail(user, otp, token).catch(() => {});
    return success(res, {}, 'If that email exists, a reset link has been sent.');
  } catch (err) {
    next(err);
  }
};

// ── POST /api/auth/reset-password ────────────────────────────
const resetPassword = async (req, res, next) => {
  try {
    const { otp, token, email, newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return error(res, 'Password must be at least 6 characters.', 400);
    }

    let otpRecord;

    if (token) {
      const hashed = hashToken(token);
      otpRecord = await prisma.oTP.findFirst({
        where: { token: hashed, type: 'PASSWORD_RESET', used: false },
        include: { user: true },
      });
    } else if (otp && email) {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return error(res, 'Invalid request.', 400);
      otpRecord = await prisma.oTP.findFirst({
        where: { userId: user.id, code: otp, type: 'PASSWORD_RESET', used: false },
        include: { user: true },
      });
    } else {
      return error(res, 'Provide OTP or reset token.', 400);
    }

    if (!otpRecord)                        return error(res, 'Invalid or expired code.', 400);
    if (new Date() > otpRecord.expiresAt) return error(res, 'Reset code has expired. Please request a new one.', 400);

    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.$transaction([
      prisma.user.update({ where: { id: otpRecord.userId }, data: { password: hashed } }),
      prisma.oTP.update({ where: { id: otpRecord.id }, data: { used: true } }),
    ]);

    return success(res, {}, 'Password reset successfully. You can now log in.');
  } catch (err) {
    next(err);
  }
};

// ── GET /api/auth/me ──────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true, fullname: true, email: true, phone: true, bvn: true,
        role: true, isFrozen: true, isVerified: true, pinSet: true,
        lastLoginAt: true, createdAt: true,
        wallet: { select: { balance: true, currency: true } },
        account: {
          select: { accountNumber: true, accountName: true, bankName: true },
        },
      },
    });
    return success(res, { user });
  } catch (err) {
    next(err);
  }
};

// ── PUT /api/auth/profile ─────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const { fullname, phone } = req.body;
    await prisma.user.update({
      where: { id: req.user.id },
      data: { fullname, phone },
    });
    return success(res, {}, 'Profile updated.');
  } catch (err) {
    next(err);
  }
};

module.exports = {
  register, login, verifyEmail, resendOTP,
  forgotPassword, resetPassword, getMe, updateProfile,
};

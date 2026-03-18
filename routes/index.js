// src/routes/index.js — all routes mounted here

const express = require('express');
const router  = express.Router();

const authController   = require('../backend/controllers/authController');
const walletController = require('../controllers/walletController');
const pinController    = require('../controllers/pinController');
const adminController  = require('../controllers/adminController');
const { protect, requireVerified, adminOnly } = require('../middlewares/auth');
const { body } = require('express-validator');

// ── Validation helpers ────────────────────────────────────────
const validate = (rules) => [...rules, (req, res, next) => {
  const { validationResult } = require('express-validator');
  const errs = validationResult(req);
  if (!errs.isEmpty()) {
    return res.status(400).json({ success: false, message: errs.array()[0].msg });
  }
  next();
}];

// ══════════════════════════════════════════════════════════════
// AUTH ROUTES
// ══════════════════════════════════════════════════════════════
router.post('/auth/register', validate([
  body('fullname').trim().notEmpty().withMessage('Full name is required'),
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('phone').isMobilePhone('en-NG').withMessage('Valid Nigerian phone required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
]), authController.register);

router.post('/auth/login', validate([
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
]), authController.login);

router.post('/auth/verify-email',    authController.verifyEmail);
router.post('/auth/resend-otp',      authController.resendOTP);
router.post('/auth/forgot-password', authController.forgotPassword);
router.post('/auth/reset-password',  authController.resetPassword);
router.get ('/auth/me',     protect, authController.getMe);
router.put ('/auth/profile', protect, requireVerified, authController.updateProfile);

// ══════════════════════════════════════════════════════════════
// WALLET ROUTES (all require auth + verified)
// ══════════════════════════════════════════════════════════════
router.get ('/wallet/dashboard',          protect, requireVerified, walletController.getDashboard);
router.post('/wallet/deposit/paystack',   protect, requireVerified, walletController.initiatePaystackDeposit);
router.post('/wallet/deposit/flutterwave',protect, requireVerified, walletController.initiateFlutterwaveDeposit);
router.get ('/wallet/deposit/verify/:reference', protect, walletController.verifyPayment);
router.post('/wallet/transfer/internal',  protect, requireVerified, walletController.internalTransfer);
router.post('/wallet/transfer/external',  protect, requireVerified, walletController.externalTransfer);
router.get ('/wallet/transfer/lookup',    protect, requireVerified, walletController.lookupAccount);
router.post('/wallet/airtime',            protect, requireVerified, walletController.buyAirtime);
router.post('/wallet/data',               protect, requireVerified, walletController.buyData);
router.get ('/wallet/transactions',       protect, requireVerified, walletController.getTransactions);

// ══════════════════════════════════════════════════════════════
// PIN ROUTES
// ══════════════════════════════════════════════════════════════
router.get ('/pin/status', protect, pinController.pinStatus);
router.post('/pin/set',    protect, requireVerified, pinController.setPin);
router.post('/pin/change', protect, requireVerified, pinController.changePin);
router.post('/pin/verify', protect, requireVerified, pinController.verifyPin);

// ══════════════════════════════════════════════════════════════
// ADMIN ROUTES
// ══════════════════════════════════════════════════════════════
router.get ('/admin/stats',               protect, adminOnly, adminController.getStats);
router.get ('/admin/users',               protect, adminOnly, adminController.getUsers);
router.get ('/admin/transactions',        protect, adminOnly, adminController.getAllTransactions);
router.post('/admin/freeze/:userId',      protect, adminOnly, adminController.freezeUser);

// ══════════════════════════════════════════════════════════════
// WEBHOOK ROUTES (public)
// ══════════════════════════════════════════════════════════════
router.post('/webhook/paystack',    express.json(), walletController.paystackWebhook);
router.post('/webhook/flutterwave', express.json(), walletController.flutterwaveWebhook);

// ── Health check ──────────────────────────────────────────────
router.get('/health', (req, res) =>
  res.json({ success: true, message: 'FintechWallet v2 API running', timestamp: new Date() })
);

module.exports = router;
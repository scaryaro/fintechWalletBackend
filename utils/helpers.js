// src/utils/helpers.js

const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');

// Generate unique transaction reference
const generateReference = (prefix = 'TXN') => {
  const ts   = Date.now().toString(36).toUpperCase();
  const rand = uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
  return `${prefix}-${ts}-${rand}`;
};

// Generate 6-digit OTP
const generateOTP = () =>
  Math.floor(100000 + Math.random() * 900000).toString();

// Generate unique 10-digit NUBAN-style account number
const generateAccountNumber = () => {
  const prefix = '301';
  const random = Math.floor(Math.random() * 9999999).toString().padStart(7, '0');
  return prefix + random;
};

// Hash a string with SHA-256 (for token storage)
const hashToken = (token) =>
  crypto.createHash('sha256').update(token).digest('hex');

// OTP expiry — default 10 minutes
const otpExpiry = (minutes = 10) => {
  const d = new Date();
  d.setMinutes(d.getMinutes() + minutes);
  return d;
};

// Consistent API response helpers
const success = (res, data = {}, message = 'Success', statusCode = 200) =>
  res.status(statusCode).json({ success: true, message, ...data });

const error = (res, message = 'Something went wrong', statusCode = 500) =>
  res.status(statusCode).json({ success: false, message });

module.exports = {
  generateReference,
  generateOTP,
  generateAccountNumber,
  hashToken,
  otpExpiry,
  success,
  error,
};
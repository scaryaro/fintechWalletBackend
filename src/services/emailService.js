// src/services/emailService.js

const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST   || 'smtp.gmail.com',
  port:   parseInt(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const from = process.env.EMAIL_FROM || 'FintechWallet <no-reply@fintechwallet.com>';
const appName = process.env.APP_NAME || 'FintechWallet';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

const EmailService = {

  async sendVerificationEmail(user, otp, token) {
    if (!process.env.EMAIL_USER) return;
    const verifyLink = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
    await transporter.sendMail({
      from,
      to: user.email,
      subject: `Verify your ${appName} account`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#0B3D91;">Welcome to ${appName}, ${user.fullname.split(' ')[0]}!</h2>
          <p>Use the OTP below to verify your email address. It expires in <strong>10 minutes</strong>.</p>
          <div style="background:#F0F4FF;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
            <span style="font-size:2.4rem;font-weight:700;letter-spacing:0.3em;color:#0B3D91;">${otp}</span>
          </div>
          <p>Or click the button below to verify instantly:</p>
          <a href="${verifyLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
            Verify Email
          </a>
          <p style="margin-top:24px;color:#6B7A99;font-size:0.85rem;">
            If you did not create an account, please ignore this email.
          </p>
        </div>
      `,
    });
  },

  async sendPasswordResetEmail(user, otp, token) {
    if (!process.env.EMAIL_USER) return;
    const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    await transporter.sendMail({
      from,
      to: user.email,
      subject: `Reset your ${appName} password`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#0B3D91;">Password Reset Request</h2>
          <p>We received a request to reset your password. Use the OTP below — it expires in <strong>10 minutes</strong>.</p>
          <div style="background:#F0F4FF;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
            <span style="font-size:2.4rem;font-weight:700;letter-spacing:0.3em;color:#0B3D91;">${otp}</span>
          </div>
          <p>Or click the button to reset via link:</p>
          <a href="${resetLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
            Reset Password
          </a>
          <p style="margin-top:24px;color:#6B7A99;font-size:0.85rem;">
            If you did not request this, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  },

  async sendTransactionAlert(user, { type, amount, balance, reference }) {
    if (!process.env.EMAIL_USER) return;
    const isCredit = ['DEPOSIT', 'TRANSFER_IN'].includes(type);
    await transporter.sendMail({
      from,
      to: user.email,
      subject: `${isCredit ? '✅ Credit' : '💸 Debit'} Alert — ₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2>${isCredit ? 'Money Received' : 'Money Sent'}</h2>
          <p>₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2 })} has been ${isCredit ? 'credited to' : 'debited from'} your wallet.</p>
          <p><strong>Reference:</strong> ${reference}</p>
          <p><strong>Balance:</strong> ₦${parseFloat(balance).toLocaleString('en-NG', { minimumFractionDigits: 2 })}</p>
        </div>
      `,
    });
  },

  async sendWelcomeEmail(user, accountNumber) {
    if (!process.env.EMAIL_USER) return;
    await transporter.sendMail({
      from,
      to: user.email,
      subject: `Welcome to ${appName} — Your account is ready 🎉`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2 style="color:#0B3D91;">Your wallet is ready, ${user.fullname.split(' ')[0]}!</h2>
          <p><strong>Account Number:</strong> ${accountNumber}</p>
          <p><strong>Bank:</strong> ${process.env.BANK_NAME || 'Fintech Bank'}</p>
          <p>Fund your wallet and start sending money instantly.</p>
          <a href="${frontendUrl}/dashboard" style="display:inline-block;background:#00C48C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;margin-top:16px;">
            Go to Dashboard
          </a>
        </div>
      `,
    });
  },
};

module.exports = EmailService;

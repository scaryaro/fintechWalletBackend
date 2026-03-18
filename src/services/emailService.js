// src/services/emailService.js

const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const from = process.env.EMAIL_FROM || 'FintechWallet <onboarding@resend.dev>';
const appName = process.env.APP_NAME || 'FintechWallet';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

const EmailService = {

  async sendVerificationEmail(user, otp, token) {
    console.log(`📧 Sending verification email to: ${user.email}`);

    const verifyLink = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;

    try {
      const response = await resend.emails.send({
        from,
        to: user.email,
        subject: `Verify your ${appName} account`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#0B3D91;">Welcome to ${appName}, ${user.fullname.split(' ')[0]}!</h2>
            <p>Use the OTP below to verify your email. It expires in <strong>10 minutes</strong>.</p>

            <div style="background:#F0F4FF;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
              <span style="font-size:2.4rem;font-weight:700;letter-spacing:0.3em;color:#0B3D91;">
                ${otp}
              </span>
            </div>

            <p>Or click below:</p>
            <a href="${verifyLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">
              Verify Email
            </a>

            <p style="margin-top:24px;color:#6B7A99;font-size:0.85rem;">
              If you did not create an account, ignore this email.
            </p>
          </div>
        `,
      });

      console.log("✅ Email sent:", response);
    } catch (err) {
      console.error("🔥 Resend Error:", err);
    }
  },

  async sendPasswordResetEmail(user, otp, token) {
    const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    await resend.emails.send({
      from,
      to: user.email,
      subject: `Reset your ${appName} password`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2>Password Reset</h2>
          <p>Your OTP (expires in 10 mins):</p>

          <div style="background:#F0F4FF;padding:20px;text-align:center;">
            <strong style="font-size:2rem;">${otp}</strong>
          </div>

          <a href="${resetLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Reset Password
          </a>
        </div>
      `,
    });
  },

  async sendTransactionAlert(user, { type, amount, balance, reference }) {
    const isCredit = ['DEPOSIT', 'TRANSFER_IN'].includes(type);

    await resend.emails.send({
      from,
      to: user.email,
      subject: `${isCredit ? '✅ Credit' : '💸 Debit'} Alert — ₦${parseFloat(amount).toLocaleString('en-NG')}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2>${isCredit ? 'Money Received' : 'Money Sent'}</h2>
          <p>₦${parseFloat(amount).toLocaleString('en-NG')} has been ${isCredit ? 'credited to' : 'debited from'} your wallet.</p>
          <p><strong>Reference:</strong> ${reference}</p>
          <p><strong>Balance:</strong> ₦${parseFloat(balance).toLocaleString('en-NG')}</p>
        </div>
      `,
    });
  },

  async sendWelcomeEmail(user, accountNumber) {
    await resend.emails.send({
      from,
      to: user.email,
      subject: `Welcome to ${appName} 🎉`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
          <h2>Your wallet is ready, ${user.fullname.split(' ')[0]}!</h2>
          <p><strong>Account Number:</strong> ${accountNumber}</p>
          <p><strong>Bank:</strong> ${process.env.BANK_NAME || 'Fintech Bank'}</p>

          <a href="${frontendUrl}/dashboard"
            style="display:inline-block;background:#00C48C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">
            Go to Dashboard
          </a>
        </div>
      `,
    });
  },
};

module.exports = EmailService;
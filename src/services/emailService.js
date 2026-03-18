// src/services/emailService.js
const nodemailer = require('nodemailer');

// ── Transporter Configuration ──────────────────────────────────
// Brevo uses standard SMTP. Port 587 (STARTTLS) or 465 (SSL)
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || 'smtp-relay.brevo.com',
  port: parseInt(process.env.EMAIL_PORT) || 587,
  secure: false, // true for 465, false for 587
  auth: {
    user: process.env.BREVO_USER,
    pass: process.env.BREVO_SMTP_KEY,
  },
});


// Verify connection configuration
transporter.verify((error, success) => {
  if (error) {
    console.error("❌ Brevo SMTP Connection Error:", error);
  } else {
    console.log("✅ Brevo SMTP Server is ready");
  }
});

const from = process.env.EMAIL_FROM || 'no-reply@fintechwallet.com';
const appName = process.env.APP_NAME || 'FintechWallet';
const frontendUrl = process.env.FRONTEND_URL || 'https://fintech-wallet-pi.vercel.app';

const EmailService = {
  /**
   * Internal helper for sending mail with logging
   */
  async _send(mailOptions) {
    try {
      const info = await transporter.sendMail(mailOptions);
      console.log("✅ Email sent successfully:", info.messageId);
      return { success: true, messageId: info.messageId };
    } catch (err) {
      console.error("🔥 Brevo/Nodemailer Error:", err.message);
      return { success: false, error: err.message };
    }
  },

  async sendVerificationEmail(user, otp, token) {
    console.log(`📧 Sending Verification Email to: ${user.email}`);
    const verifyLink = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;

    return await this._send({
      from: `"${appName}" <${from}>`,
      to: user.email,
      subject: `Verify your ${appName} account`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;border:1px solid #f0f0f0;border-radius:10px;">
          <h2 style="color:#0B3D91;">Welcome to ${appName}, ${user.fullname.split(' ')[0]}!</h2>
          <p>Use the OTP below to verify your email. It expires in 10 minutes.</p>
          <div style="background:#F0F4FF;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
            <span style="font-size:2.4rem;font-weight:700;letter-spacing:0.3em;color:#0B3D91;">${otp}</span>
          </div>
          <p>Or click the button below:</p>
          <a href="${verifyLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Verify Email</a>
        </div>
      `,
    });
  },

  async sendPasswordResetEmail(user, otp, token) {
    console.log(`📧 Sending Password Reset Email to: ${user.email}`);
    const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    return await this._send({
      from: `"${appName}" <${from}>`,
      to: user.email,
      subject: `Reset your ${appName} password`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;">
          <h2 style="color:#0B3D91;">Password Reset Request</h2>
          <div style="background:#F0F4FF;padding:20px;text-align:center;margin:20px 0;">
            <strong style="font-size:2rem;color:#0B3D91;">${otp}</strong>
          </div>
          <a href="${resetLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset Password</a>
        </div>
      `,
    });
  },

  async sendTransactionAlert(user, { type, amount, balance, reference }) {
    console.log(`📧 Sending Transaction Alert to: ${user.email}`);
    const isCredit = ['DEPOSIT', 'TRANSFER_IN'].includes(type);

    return await this._send({
      from: `"${appName}" <${from}>`,
      to: user.email,
      subject: `${isCredit ? '✅ Credit' : '💸 Debit'} Alert — ₦${parseFloat(amount).toLocaleString('en-NG')}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;">
          <h2 style="${isCredit ? 'color:#00C48C;' : 'color:#FF4D4D;'}">${isCredit ? 'Money Received' : 'Money Sent'}</h2>
          <p>₦${parseFloat(amount).toLocaleString('en-NG')} has been ${isCredit ? 'credited to' : 'debited from'} your wallet.</p>
          <p><strong>Reference:</strong> ${reference}</p>
          <p><strong>Balance:</strong> ₦${parseFloat(balance).toLocaleString('en-NG')}</p>
        </div>
      `,
    });
  },

  async sendWelcomeEmail(user, accountNumber) {
    console.log(`📧 Sending Welcome Email to: ${user.email}`);
    return await this._send({
      from: `"${appName}" <${from}>`,
      to: user.email,
      subject: `Welcome to ${appName} 🎉`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;">
          <h2 style="color:#0B3D91;">Your wallet is ready, ${user.fullname.split(' ')[0]}!</h2>
          <p><strong>Account Number:</strong> ${accountNumber}</p>
          <p>Fund your wallet and start transacting.</p>
          <a href="${frontendUrl}/dashboard" style="display:inline-block;background:#00C48C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">Go to Dashboard</a>
        </div>
      `,
    });
  },
};

module.exports = EmailService;
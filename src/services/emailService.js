// src/services/emailService.js
const { Resend } = require('resend');

// Ensure the API Key is loaded
if (!process.env.RESEND_API_KEY) {
  console.warn("⚠️ WARNING: RESEND_API_KEY is not defined in environment variables.");
}

const resend = new Resend(process.env.RESEND_API_KEY);

const from = process.env.EMAIL_FROM || 'onboarding@resend.dev'; // Default for free tier
const appName = process.env.APP_NAME || 'FintechWallet';
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';

const EmailService = {
  /**
   * Internal helper to handle Resend API calls and logging
   */
  async _send(payload) {
    try {
      const { data, error } = await resend.emails.send(payload);

      if (error) {
        console.error("❌ Resend API Error:", {
          message: error.message,
          name: error.name,
          statusCode: error.statusCode
        });
        return { success: false, error };
      }

      console.log("✅ Email sent successfully. ID:", data.id);
      return { success: true, data };
    } catch (err) {
      console.error("🔥 Unexpected System Error in EmailService:", err.message);
      return { success: false, error: err.message };
    }
  },

  async sendVerificationEmail(user, otp, token) {
    console.log(`📧 Attempting Verification Email to: ${user.email}`);
    const verifyLink = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;

    return await this._send({
      from: `${appName} <${from}>`,
      to: user.email,
      subject: `Verify your ${appName} account`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;padding:20px;border-radius:10px;">
          <h2 style="color:#0B3D91;">Welcome to ${appName}, ${user.fullname.split(' ')[0]}!</h2>
          <p>Use the OTP below to verify your email. It expires in <strong>10 minutes</strong>.</p>
          <div style="background:#F0F4FF;border-radius:12px;padding:24px;text-align:center;margin:24px 0;">
            <span style="font-size:2.4rem;font-weight:700;letter-spacing:0.3em;color:#0B3D91;">${otp}</span>
          </div>
          <p>Or click below to verify instantly:</p>
          <a href="${verifyLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Verify Email</a>
        </div>
      `,
    });
  },

  async sendPasswordResetEmail(user, otp, token) {
    console.log(`📧 Attempting Password Reset Email to: ${user.email}`);
    const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;

    return await this._send({
      from: `${appName} <${from}>`,
      to: user.email,
      subject: `Reset your ${appName} password`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;padding:20px;">
          <h2 style="color:#0B3D91;">Password Reset Request</h2>
          <p>Your OTP (expires in 10 mins):</p>
          <div style="background:#F0F4FF;padding:20px;text-align:center;margin:20px 0;">
            <strong style="font-size:2rem;color:#0B3D91;">${otp}</strong>
          </div>
          <a href="${resetLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">Reset Password</a>
        </div>
      `,
    });
  },

  async sendTransactionAlert(user, { type, amount, balance, reference }) {
    console.log(`📧 Attempting Transaction Alert to: ${user.email}`);
    const isCredit = ['DEPOSIT', 'TRANSFER_IN'].includes(type);

    return await this._send({
      from: `${appName} <${from}>`,
      to: user.email,
      subject: `${isCredit ? '✅ Credit' : '💸 Debit'} Alert — ₦${parseFloat(amount).toLocaleString('en-NG')}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;padding:20px;">
          <h2 style="${isCredit ? 'color:#00C48C;' : 'color:#FF4D4D;'}">${isCredit ? 'Money Received' : 'Money Sent'}</h2>
          <p>₦${parseFloat(amount).toLocaleString('en-NG')} has been ${isCredit ? 'credited to' : 'debited from'} your wallet.</p>
          <hr style="border:0;border-top:1px solid #eee;" />
          <p><strong>Reference:</strong> ${reference}</p>
          <p><strong>Current Balance:</strong> ₦${parseFloat(balance).toLocaleString('en-NG')}</p>
        </div>
      `,
    });
  },

  async sendWelcomeEmail(user, accountNumber) {
    console.log(`📧 Attempting Welcome Email to: ${user.email}`);
    return await this._send({
      from: `${appName} <${from}>`,
      to: user.email,
      subject: `Welcome to ${appName} 🎉`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #eee;padding:20px;">
          <h2 style="color:#0B3D91;">Your wallet is ready, ${user.fullname.split(' ')[0]}!</h2>
          <p><strong>Account Number:</strong> ${accountNumber}</p>
          <p><strong>Bank:</strong> ${process.env.BANK_NAME || 'Fintech Bank'}</p>
          <p>Fund your wallet to get started.</p>
          <a href="${frontendUrl}/dashboard" style="display:inline-block;background:#00C48C;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;">Go to Dashboard</a>
        </div>
      `,
    });
  },
};

module.exports = EmailService;
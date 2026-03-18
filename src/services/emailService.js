// src/services/emailService.js
const Brevo = require('@getbrevo/brevo');

// Initialize Brevo API client correctly
let apiInstance = new Brevo.TransactionalEmailsApi();

// Set the API Key
apiInstance.setApiKey(Brevo.TransactionalEmailsApiApiKeys.apiKey, process.env.BREVO_SMTP_KEY);

const fromEmail = process.env.EMAIL_FROM || 'a55b63001@smtp-brevo.com'; 
const appName = process.env.APP_NAME || 'FintechWallet';
const frontendUrl = process.env.FRONTEND_URL || 'https://fintech-wallet-pi.vercel.app';

const EmailService = {
  /**
   * Internal helper to send emails via HTTP API
   */
  async _send(to, subject, htmlContent) {
    let sendSmtpEmail = new Brevo.SendSmtpEmail();

    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { name: appName, email: fromEmail };
    sendSmtpEmail.to = [{ email: to }];

    try {
      const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ Email sent via API! Message ID: ${data.body.messageId}`);
      return { success: true };
    } catch (error) {
      // Improved error logging to see exactly what Brevo says
      const errorDetail = error.response ? error.response.body : error.message;
      console.error("❌ Brevo API Error:", errorDetail);
      return { success: false, error: errorDetail };
    }
  },

  async sendVerificationEmail(user, otp, token) {
    console.log(`📧 API: Sending Verification to: ${user.email}`);
    const verifyLink = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
    
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;border:1px solid #eee;border-radius:10px;">
        <h2 style="color:#0B3D91;">Welcome, ${user.fullname.split(' ')[0]}!</h2>
        <p>Use the OTP below to verify your account:</p>
        <div style="background:#F0F4FF;padding:20px;text-align:center;margin:20px 0;">
          <strong style="font-size:2rem;color:#0B3D91;">${otp}</strong>
        </div>
        <p>Or click the button below:</p>
        <a href="${verifyLink}" style="display:inline-block;background:#0B3D91;color:#fff;padding:12px 28px;text-decoration:none;border-radius:8px;">Verify Email</a>
      </div>`;

    return await this._send(user.email, `Verify your ${appName} account`, html);
  },

  async sendPasswordResetEmail(user, otp, token) {
    console.log(`📧 API: Sending Password Reset to: ${user.email}`);
    const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    const html = `<h3>Password Reset</h3><p>Your OTP is: <strong>${otp}</strong></p><a href="${resetLink}">Reset Password</a>`;
    return await this._send(user.email, `Reset your ${appName} password`, html);
  },

  async sendTransactionAlert(user, { type, amount, balance, reference }) {
    console.log(`📧 API: Sending Transaction Alert to: ${user.email}`);
    const isCredit = ['DEPOSIT', 'TRANSFER_IN'].includes(type);
    const html = `<h3>${isCredit ? 'Credit' : 'Debit'} Alert</h3><p>Amount: ₦${amount}</p><p>Ref: ${reference}</p>`;
    return await this._send(user.email, `Transaction Alert: ₦${amount}`, html);
  },

  async sendWelcomeEmail(user, accountNumber) {
    console.log(`📧 API: Sending Welcome Email to: ${user.email}`);
    const html = `<h2>Welcome!</h2><p>Your account is ready. Account Number: <strong>${accountNumber}</strong></p>`;
    return await this._send(user.email, `Welcome to ${appName}!`, html);
  }
};

module.exports = EmailService;
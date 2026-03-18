// src/services/emailService.js
const Brevo = require('@getbrevo/brevo');

// Initialize Brevo API client
const apiInstance = new Brevo.TransactionalEmailsApi();
const apiKey = apiInstance.authentications['apiKey'];
apiKey.apiKey = process.env.BREVO_SMTP_KEY; // Use your Brevo Master Key here

const fromEmail = process.env.EMAIL_FROM || 'a55b63001@smtp-brevo.com'; 
const appName = process.env.APP_NAME || 'FintechWallet';
const frontendUrl = process.env.FRONTEND_URL || 'https://fintech-wallet-pi.vercel.app';

const EmailService = {
  async _send(to, subject, htmlContent) {
    const sendSmtpEmail = new Brevo.SendSmtpEmail();

    sendSmtpEmail.subject = subject;
    sendSmtpEmail.htmlContent = htmlContent;
    sendSmtpEmail.sender = { name: appName, email: fromEmail };
    sendSmtpEmail.to = [{ email: to }];

    try {
      const data = await apiInstance.sendTransacEmail(sendSmtpEmail);
      console.log(`✅ Email sent via API! Message ID: ${data.messageId}`);
      return { success: true };
    } catch (error) {
      console.error("❌ Brevo API Error:", error.response ? error.response.body : error.message);
      return { success: false, error: error.message };
    }
  },

  async sendVerificationEmail(user, otp, token) {
    console.log(`📧 API: Sending Verification to: ${user.email}`);
    const verifyLink = `${frontendUrl}/verify-email?token=${token}&email=${encodeURIComponent(user.email)}`;
    
    const html = `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:20px;border:1px solid #eee;">
        <h2 style="color:#0B3D91;">Welcome, ${user.fullname.split(' ')[0]}!</h2>
        <p>Your OTP: <strong style="font-size:1.5rem;">${otp}</strong></p>
        <a href="${verifyLink}" style="background:#0B3D91;color:#fff;padding:10px 20px;text-decoration:none;border-radius:5px;">Verify Now</a>
      </div>`;

    return await this._send(user.email, `Verify your ${appName} account`, html);
  },

  async sendPasswordResetEmail(user, otp, token) {
    const resetLink = `${frontendUrl}/reset-password?token=${token}&email=${encodeURIComponent(user.email)}`;
    const html = `<p>Your Reset OTP: <strong>${otp}</strong></p><a href="${resetLink}">Reset Password</a>`;
    return await this._send(user.email, `Reset your ${appName} password`, html);
  },

  async sendTransactionAlert(user, { type, amount, balance, reference }) {
    const isCredit = ['DEPOSIT', 'TRANSFER_IN'].includes(type);
    const html = `<h3>${isCredit ? 'Credit' : 'Debit'} Alert</h3><p>Amount: ₦${amount}</p><p>Ref: ${reference}</p>`;
    return await this._send(user.email, `Transaction Alert: ₦${amount}`, html);
  },

  async sendWelcomeEmail(user, accountNumber) {
    const html = `<h2>Welcome!</h2><p>Your account number is: <strong>${accountNumber}</strong></p>`;
    return await this._send(user.email, `Welcome to ${appName}!`, html);
  }
};

module.exports = EmailService;
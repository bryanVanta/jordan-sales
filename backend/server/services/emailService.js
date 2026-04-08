/**
 * Email Service (Resend)
 * Uses Resend API for sending emails (works on localhost, Render, Vercel, etc.)
 * No SMTP timeouts or firewall issues
 */

const resendService = require('./resendService');

class EmailService {
  constructor() {
    // Use Resend service instead of Nodemailer SMTP
    this.resend = resendService;
  }

  async sendEmail(to, subject, body, fromEmail = process.env.RESEND_FROM_EMAIL) {
    try {
      // Delegate to Resend service
      const result = await this.resend.sendEmail(to, subject, body, fromEmail);
      return result;
    } catch (error) {
      console.error('[EmailService] Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  async validateEmail(email) {
    // TODO: Implement email validation logic
    console.log(`[EmailService] Validating: ${email}`);
    return true;
  }

  async getInboundEmails() {
    // Resend webhook for inbound emails is handled in the webhooks route
    console.log('[EmailService] Fetching inbound emails');
    return [];
  }
}

module.exports = new EmailService();

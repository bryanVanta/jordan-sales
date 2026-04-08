/**
 * Email Service (Nodemailer SMTP)
 * Uses Nodemailer for SMTP email sending
 */

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    const smtpPort = Number(process.env.SMTP_PORT);
    const smtpSecure = (process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true';

    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number.isFinite(smtpPort) ? smtpPort : 465,
      secure: smtpSecure, // true for 465, false for other ports
      auth: {
        user: (process.env.NODEMAILER_USER || '').trim(),
        pass: (process.env.NODEMAILER_PASS || '').trim(),
      },
    });
  }

  async sendEmail(to, subject, body, fromEmail = process.env.DEFAULT_FROM_EMAIL) {
    try {
      // Convert newlines to <br> tags for proper HTML rendering
      const htmlBody = body
        .split('\n')
        .map(line => line || '<br>') // Preserve empty lines as breaks
        .join('<br>');

      const info = await this.transporter.sendMail({
        from: fromEmail,
        to,
        subject,
        text: body,
        html: `<div style="white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`,
      });

      console.log(`Email sent: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      console.error('Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  async validateEmail(email) {
    // TODO: Implement email validation logic
    console.log(`Validating: ${email}`);
    return true;
  }

  async getInboundEmails() {
    // TODO: Implement webhook for inbound
    console.log('Fetching inbound emails');
    return [];
  }
}

module.exports = new EmailService();

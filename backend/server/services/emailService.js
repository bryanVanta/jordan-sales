/**
 * Email Service (Nodemailer + Resend)
 */

const nodemailer = require('nodemailer');

class EmailService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.NODEMAILER_USER,
        pass: process.env.NODEMAILER_PASS,
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
    // TODO: Implement Resend webhook for inbound
    console.log('Fetching inbound emails');
    return [];
  }
}

module.exports = new EmailService();

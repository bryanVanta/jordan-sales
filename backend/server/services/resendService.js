/**
 * Resend Email Service
 * Handles sending emails and receiving webhooks from Resend for inbound email processing
 */

const { Resend } = require('resend');

class ResendService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
  }

  /**
   * Send email via Resend
   * @param {string} to - Recipient email
   * @param {string} subject - Email subject
   * @param {string} body - Email body content
   * @param {string} fromEmail - Sender email (optional)
   */
  async sendEmail(to, subject, body, fromEmail = this.fromEmail) {
    try {
      console.log(`[Resend] Sending email to ${to}...`);
      
      // Convert newlines to HTML breaks for better rendering
      const htmlBody = body
        .split('\n')
        .map(line => line || '<br>') // Preserve empty lines as breaks
        .join('<br>');

      const response = await this.resend.emails.send({
        from: fromEmail,
        to: to,
        subject: subject,
        html: `<div style="white-space: pre-wrap; font-family: Arial, sans-serif; line-height: 1.6;">${htmlBody}</div>`,
      });

      const messageId = response?.data?.id || response?.id || response?.result?.id || `email-${Date.now()}`;
      console.log(`[Resend] Full response:`, JSON.stringify(response, null, 2));
      console.log(`[Resend] Email sent successfully: ${messageId}`);
      return { 
        success: true, 
        messageId: messageId,
        response 
      };
    } catch (error) {
      console.error('[Resend] Error sending email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Process incoming email webhook from Resend
   * This will be called from the webhook endpoint
   * @param {object} emailData - Parsed email data from Resend webhook
   */
  async processInboundEmail(emailData) {
    try {
      console.log('[Resend] Processing inbound email:', emailData);
      
      // Extract relevant data from the webhook payload
      const {
        from,
        to,
        subject,
        text,
        html,
        messageId,
        timestamp,
        replyTo,
      } = emailData;

      // Return structured inbound email object
      return {
        sender: from,
        recipient: to,
        subject: subject,
        content: text || html || '',
        messageId: messageId,
        timestamp: timestamp || new Date(),
        replyTo: replyTo || from,
        source: 'resend_inbound',
      };
    } catch (error) {
      console.error('[Resend] Error processing inbound email:', error);
      throw error;
    }
  }
}

module.exports = new ResendService();

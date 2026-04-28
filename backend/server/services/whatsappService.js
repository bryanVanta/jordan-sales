/**
 * WhatsApp Service
 * Provider: Twilio (default) or OpenClaw (Baileys via gateway)
 */

const twilio = require('twilio');
const openClawWhatsAppService = require('./openClawWhatsAppService');

class WhatsAppService {
  constructor() {
    this.provider = (process.env.WHATSAPP_PROVIDER || 'twilio').trim().toLowerCase();
    this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  async sendMessage(to, message, options = {}) {
    try {
      if (this.provider === 'openclaw') {
        return await openClawWhatsAppService.sendMessage(to, message);
      }

      const fromValue = String(process.env.TWILIO_WHATSAPP_NUMBER || '').trim();
      const from = fromValue.startsWith('whatsapp:') ? fromValue : `whatsapp:${fromValue}`;
      const toValue = String(to || '').trim();
      const normalizedTo = toValue.startsWith('whatsapp:') ? toValue : `whatsapp:${toValue}`;

      const response = await this.client.messages.create({
        from,
        to: normalizedTo,
        body: message,
        ...(Array.isArray(options.mediaUrls) && options.mediaUrls.length ? { mediaUrl: options.mediaUrls.slice(0, 10) } : {}),
      });

      console.log(`WhatsApp message sent: ${response.sid}`);
      return { success: true, messageId: response.sid };
    } catch (error) {
      console.error('Error sending WhatsApp message:', error);
      return { success: false, error: error.message };
    }
  }

  async getInboundMessages() {
    // TODO: Implement Twilio webhook for inbound messages
    console.log('Fetching WhatsApp messages');
    return [];
  }
}

module.exports = new WhatsAppService();

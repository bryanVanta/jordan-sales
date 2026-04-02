/**
 * WhatsApp Service (Twilio)
 */

const twilio = require('twilio');

class WhatsAppService {
  constructor() {
    this.client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }

  async sendMessage(to, message) {
    try {
      const response = await this.client.messages.create({
        from: `whatsapp:${process.env.TWILIO_WHATSAPP_NUMBER}`,
        to: `whatsapp:${to}`,
        body: message,
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

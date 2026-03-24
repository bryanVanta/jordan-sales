/**
 * WhatsApp Service (Twilio)
 */

class WhatsAppService {
  async sendMessage(to, message) {
    // TODO: Implement Twilio WhatsApp
    console.log(`Sending WhatsApp to: ${to}`);
    return { success: true, messageId: '' };
  }

  async getInboundMessages() {
    // TODO: Implement Twilio webhook
    console.log('Fetching WhatsApp messages');
    return [];
  }
}

module.exports = new WhatsAppService();

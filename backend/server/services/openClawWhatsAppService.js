/**
 * OpenClaw WhatsApp Service (Baileys via OpenClaw Gateway)
 *
 * Sends outbound WhatsApp messages by invoking OpenClaw on the gateway host over SSH.
 *
 * Implementation note:
 * - We use `openclaw gateway call agent ... --deliver --reply-channel whatsapp --reply-to <E164>`
 *   because `openclaw message send` doesn't accept `--url` and can be difficult to target remotely.
 */

const { spawn } = require('child_process');

const OPENCLAW_SSH_TARGET = (process.env.OPENCLAW_SSH_TARGET || 'jeff@192.168.100.199').trim();
const OPENCLAW_WHATSAPP_ACCOUNT = (process.env.OPENCLAW_WHATSAPP_ACCOUNT || '').trim(); // optional
const OPENCLAW_CLI_PATH = (process.env.OPENCLAW_CLI_PATH || '/home/jeff/.npm-global/bin/openclaw').trim();
const OPENCLAW_GATEWAY_URL = (
  process.env.OPENCLAW_GATEWAY_URL ||
  process.env.OPENCLAW_JORDAN_REMOTE_GATEWAY_URL ||
  process.env.OPENCLAW_JORDAN_GATEWAY_BASE_URL ||
  ''
).trim();
const OPENCLAW_GATEWAY_TOKEN = (process.env.OPENCLAW_JORDAN_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || '').trim();
const OPENCLAW_RPC_TIMEOUT_MS = Number(process.env.OPENCLAW_JORDAN_RPC_TIMEOUT_MS || 60000);
const OPENCLAW_WHATSAPP_AGENT_ID = (process.env.OPENCLAW_WHATSAPP_AGENT_ID || process.env.OPENCLAW_JORDAN_AGENT_ID || 'main').trim();

const parseJsonObject = (text = '') => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    // Best-effort extraction for CLI output with extra logs.
  }

  const startObj = trimmed.indexOf('{');
  const endObj = trimmed.lastIndexOf('}');
  if (startObj >= 0 && endObj > startObj) {
    try {
      return JSON.parse(trimmed.slice(startObj, endObj + 1));
    } catch {
      return null;
    }
  }
  return null;
};

const normalizeE164 = (input = '') => {
  const value = String(input || '').trim();
  if (!value) return '';

  // already E.164
  if (value.startsWith('+')) return value;

  // remove non-digits
  const digits = value.replace(/[^\d]/g, '');
  if (!digits) return '';

  // naive default: assume it already includes country code if length >= 10
  return `+${digits}`;
};

class OpenClawWhatsAppService {
  async sendMessage(to, message) {
    const target = normalizeE164(to);
    const trimmedMessage = String(message || '').trim();

    if (!target) {
      return { success: false, error: 'Missing/invalid WhatsApp target number' };
    }
    if (!trimmedMessage) {
      return { success: false, error: 'Missing message body' };
    }

    const cli = OPENCLAW_CLI_PATH.replace(/'/g, `'\"'\"'`);
    const remoteGatewayUrl = OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:30080';
    const tokenArg = OPENCLAW_GATEWAY_TOKEN ? ` --token '${OPENCLAW_GATEWAY_TOKEN.replace(/'/g, `'\"'\"'`)}'` : '';

    // Use gateway RPC so we can always pass --url/--token reliably.
    const remoteCommand =
      `PARAMS="$(cat)"; ` +
      `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 '${cli}' gateway call agent --json --expect-final ` +
      `--url '${remoteGatewayUrl.replace(/'/g, `'\"'\"'`)}' --params "$PARAMS"${tokenArg} --timeout ${OPENCLAW_RPC_TIMEOUT_MS}`;

    return await new Promise((resolve) => {
      const sshProcess = spawn('ssh', [OPENCLAW_SSH_TARGET, remoteCommand], {
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      sshProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      sshProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      sshProcess.on('close', (code) => {
        if (code !== 0) {
          resolve({
            success: false,
            error: `OpenClaw WhatsApp send failed (ssh exit ${code})`,
            details: stderr.slice(0, 800) || stdout.slice(0, 800),
          });
          return;
        }

        const parsed = parseJsonObject(stdout);
        const messageId =
          parsed?.messageId ||
          parsed?.id ||
          parsed?.data?.id ||
          parsed?.result?.id ||
          null;

        resolve({
          success: true,
          messageId,
          raw: parsed || stdout.slice(0, 2000),
        });
      });

      sshProcess.on('error', (err) => {
        resolve({ success: false, error: err.message });
      });

      const strictPrompt =
        `Reply with EXACTLY the following text and nothing else. Do not add quotes, emojis, or extra lines.\n\n` +
        trimmedMessage;

      const params = {
        agentId: OPENCLAW_WHATSAPP_AGENT_ID,
        idempotencyKey: `wa-send-${Date.now()}`,
        message: strictPrompt,
        to: target,
        deliver: true,
        replyChannel: 'whatsapp',
        replyTo: target,
        timeout: Math.ceil(OPENCLAW_RPC_TIMEOUT_MS / 1000),
      };

      if (OPENCLAW_WHATSAPP_ACCOUNT) params.replyAccount = OPENCLAW_WHATSAPP_ACCOUNT;
      sshProcess.stdin.write(JSON.stringify(params));
      sshProcess.stdin.end();
    });
  }
}

module.exports = new OpenClawWhatsAppService();

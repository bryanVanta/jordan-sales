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
const OPENCLAW_SSH_PORT = Number(process.env.OPENCLAW_SSH_PORT || 22);
const OPENCLAW_SSH_IDENTITY = (process.env.OPENCLAW_SSH_IDENTITY || '').trim();
const OPENCLAW_DOCKER_CONTAINER = (process.env.OPENCLAW_DOCKER_CONTAINER || 'openclaw-sales-bot').trim();
const OPENCLAW_CONTAINER_CLI = (process.env.OPENCLAW_CONTAINER_CLI || 'openclaw').trim();
const OPENCLAW_RUN_IN_DOCKER = String(process.env.OPENCLAW_RUN_IN_DOCKER || '1').trim() !== '0';
const OPENCLAW_GATEWAY_URL = (
  process.env.OPENCLAW_GATEWAY_URL ||
  process.env.OPENCLAW_JORDAN_REMOTE_GATEWAY_URL ||
  process.env.OPENCLAW_JORDAN_GATEWAY_BASE_URL ||
  ''
).trim();
const OPENCLAW_GATEWAY_TOKEN = (process.env.OPENCLAW_JORDAN_GATEWAY_TOKEN || process.env.OPENCLAW_GATEWAY_TOKEN || '').trim();
const OPENCLAW_RPC_TIMEOUT_MS = (() => {
  const raw = process.env.OPENCLAW_WHATSAPP_RPC_TIMEOUT_MS || process.env.OPENCLAW_JORDAN_RPC_TIMEOUT_MS || '300000';
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return 300000;
  return Math.max(1000, Math.floor(parsed));
})();
const OPENCLAW_WHATSAPP_AGENT_ID = (process.env.OPENCLAW_WHATSAPP_AGENT_ID || process.env.OPENCLAW_JORDAN_AGENT_ID || 'main').trim();

const shellEscapeSingleQuoted = (value = '') => String(value).replace(/'/g, `'\"'\"'`);
const shQuote = (value = '') => `'${shellEscapeSingleQuoted(String(value))}'`;

const wrapInDockerExec = (script = '') => {
  if (!OPENCLAW_RUN_IN_DOCKER) return script;
  if (!OPENCLAW_DOCKER_CONTAINER) return script;
  return `docker exec -i ${shQuote(OPENCLAW_DOCKER_CONTAINER)} sh -lc ${shQuote(script)}`;
};

const getOpenClawCliForRuntime = () => {
  if (OPENCLAW_RUN_IN_DOCKER && OPENCLAW_DOCKER_CONTAINER) return OPENCLAW_CONTAINER_CLI || 'openclaw';
  return OPENCLAW_CLI_PATH;
};

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

const extractProviderErrorFromPayloadText = (payloadText = '') => {
  const text = String(payloadText || '').trim();
  if (!text) return '';

  const parsed = parseJsonObject(text);
  if (!parsed || typeof parsed !== 'object') return '';

  if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail.trim();
  if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error.trim();
  if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message.trim();
  if (typeof parsed?.error?.message === 'string' && parsed.error.message.trim()) return parsed.error.message.trim();

  return '';
};

const extractProviderErrorFromOpenClawResponse = (parsed = {}) => {
  if (!parsed || typeof parsed !== 'object') return '';

  const direct =
    parsed?.detail ||
    parsed?.error ||
    parsed?.message ||
    parsed?.result?.detail ||
    parsed?.result?.error ||
    parsed?.result?.message;

  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const payloadText = parsed?.result?.payloads?.[0]?.text || parsed?.payloads?.[0]?.text || '';
  return extractProviderErrorFromPayloadText(payloadText);
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

    const remoteGatewayUrl = OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:30080';
    const tokenArg = OPENCLAW_GATEWAY_TOKEN ? ` --token '${shellEscapeSingleQuoted(OPENCLAW_GATEWAY_TOKEN)}'` : '';
    const cli = shellEscapeSingleQuoted(getOpenClawCliForRuntime());

    // Use gateway RPC so we can always pass --url/--token reliably.
    const innerScript =
      `PARAMS="$(cat)"; ` +
      `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 '${cli}' gateway call agent --json --expect-final ` +
      `--url '${shellEscapeSingleQuoted(remoteGatewayUrl)}' --params "$PARAMS"${tokenArg} --timeout ${OPENCLAW_RPC_TIMEOUT_MS}`;

    const remoteCommand = wrapInDockerExec(innerScript);

    return await new Promise((resolve) => {
      const sshArgs = ['-o', 'BatchMode=yes'];
      if (OPENCLAW_SSH_IDENTITY) sshArgs.push('-i', OPENCLAW_SSH_IDENTITY);
      if (Number.isFinite(OPENCLAW_SSH_PORT) && OPENCLAW_SSH_PORT && OPENCLAW_SSH_PORT !== 22) {
        sshArgs.push('-p', String(OPENCLAW_SSH_PORT));
      }
      sshArgs.push(OPENCLAW_SSH_TARGET, remoteCommand);

      const sshProcess = spawn('ssh', sshArgs, {
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
        const providerError = extractProviderErrorFromOpenClawResponse(parsed);
        if (providerError) {
          resolve({
            success: false,
            error: 'OpenClaw WhatsApp send failed (provider error)',
            details: providerError,
            raw: parsed || stdout.slice(0, 2000),
          });
          return;
        }

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

/**
 * OpenClaw WhatsApp Service (Baileys via OpenClaw Gateway)
 *
 * Sends outbound WhatsApp messages by invoking OpenClaw on the gateway host over SSH.
 *
 * Implementation note:
 * - We use `openclaw message send --channel whatsapp --target <E164> ... --json` so sends do not
 *   depend on LLM models (and therefore never deliver model/auth failure messages to customers).
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
  const raw = String(input || '').trim();
  if (!raw) return '';

  // Preserve group JIDs / WhatsApp JIDs when explicitly provided.
  // Examples: "120363...@g.us", "6012345@s.whatsapp.net"
  if (raw.includes('@')) return raw;

  const withoutPrefix = raw.toLowerCase().startsWith('whatsapp:') ? raw.slice('whatsapp:'.length) : raw;

  // Force digits-only to avoid OpenClaw rejecting values like "+60 14 123 4567".
  const digits = withoutPrefix.replace(/[^\d]/g, '');
  if (!digits) return '';

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

const enhanceProviderError = (providerError = '') => {
  const text = String(providerError || '').trim();
  if (!text) return '';

  // OpenClaw WhatsApp plugin uses a generic message for outbound blocks (allowFrom/pairing policy).
  // Help the operator understand what to change on the gateway side.
  if (/Delivering to WhatsApp requires target <E\.164\|group JID>/i.test(text)) {
    return (
      `${text}\n\n` +
      `Likely cause: OpenClaw WhatsApp outbound is blocked by channel policy (dmPolicy/allowFrom/pairing).\n` +
      `Fix on the gateway host: add the recipient number to channels.whatsapp.allowFrom (E.164), ` +
      `or switch dmPolicy to allowlist/open (open requires allowFrom includes "*"), and restart the gateway.\n` +
      `You can also check pending pairings: openclaw pairing list whatsapp`
    );
  }

  return text;
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

  if (typeof direct === 'string' && direct.trim()) return enhanceProviderError(direct.trim());

  const payloadText = parsed?.result?.payloads?.[0]?.text || parsed?.payloads?.[0]?.text || '';
  return enhanceProviderError(extractProviderErrorFromPayloadText(payloadText));
};

const runSshCommand = ({ remoteCommand, stdinPayload }) =>
  new Promise((resolve) => {
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
    let finished = false;

    const timeout = setTimeout(() => {
      if (finished) return;
      finished = true;
      try {
        sshProcess.kill();
      } catch {}
      resolve({ code: -1, stdout, stderr, timedOut: true });
    }, OPENCLAW_RPC_TIMEOUT_MS);

    sshProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    sshProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    sshProcess.on('close', (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve({ code, stdout, stderr, timedOut: false });
    });

    sshProcess.on('error', (err) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve({ code: -1, stdout, stderr: String(err && err.message ? err.message : err), timedOut: false });
    });

    if (stdinPayload) sshProcess.stdin.write(String(stdinPayload));
    sshProcess.stdin.end();
  });

const isLocalhostGatewayUrl = (url = '') => {
  const s = String(url || '').trim();
  if (!s) return true; // no URL = treat as local
  return /^(ws|http)s?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(s);
};

class OpenClawWhatsAppService {
  // Try to send a WhatsApp message via the gateway HTTP REST API.
  // Used in production where SSH to the gateway LAN IP is not reachable.
  // Returns a result object or null if HTTP is not available/configured.
  async sendMessageViaHttp(target, message) {
    if (!OPENCLAW_GATEWAY_URL || isLocalhostGatewayUrl(OPENCLAW_GATEWAY_URL)) return null;
    const token = OPENCLAW_GATEWAY_TOKEN;
    if (!token) return null;

    const httpBase = OPENCLAW_GATEWAY_URL.replace(/^ws(s?)/, 'http$1').replace(/\/$/, '');
    const body = JSON.stringify({
      target,
      message,
      ...(OPENCLAW_WHATSAPP_ACCOUNT ? { account: OPENCLAW_WHATSAPP_ACCOUNT } : {}),
    });

    // Endpoint candidates — try each until one returns non-404.
    const endpoints = [
      '/api/channels/whatsapp/send',
      '/api/channels/whatsapp/message',
      '/api/channels/whatsapp/messages',
      '/api/messages/send',
    ];
    // Auth header candidates — try each until one returns non-401.
    const authCandidates = [
      { 'x-gateway-token': token },
      { 'x-openclaw-token': token },
      { 'Authorization': `Bearer ${token}` },
      { 'X-OpenClaw-Token': token },
      { 'X-Gateway-Token': token },
    ];

    console.log(`[OpenClaw] HTTP send attempting: ${httpBase} (target: ${target})`);

    for (const endpoint of endpoints) {
      for (const extra of authCandidates) {
        const authKey = Object.keys(extra)[0];
        try {
          const res = await fetch(`${httpBase}${endpoint}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...extra },
            body,
            signal: AbortSignal.timeout(30000),
          });

          const responseText = await res.text().catch(() => '');

          if (res.status === 404) {
            console.log(`[OpenClaw] HTTP ${endpoint} → 404 (wrong endpoint, trying next)`);
            break;
          }

          if (res.ok) {
            console.log(`[OpenClaw] HTTP send succeeded via ${endpoint} (auth: ${authKey})`);
            const data = responseText ? JSON.parse(responseText) : null;
            return {
              success: true,
              messageId: data?.messageId || data?.id || data?.data?.id || null,
              raw: data,
            };
          }

          console.warn(`[OpenClaw] HTTP ${endpoint} [${authKey}] → ${res.status}: ${responseText.slice(0, 300)}`);

          if (res.status !== 401 && res.status !== 403) {
            break; // Non-auth error — try next endpoint
          }
        } catch (err) {
          console.warn(`[OpenClaw] HTTP ${endpoint} [${authKey}] → fetch error: ${err?.message || err}`);
          break; // Network error — try next endpoint
        }
      }
    }

    console.warn('[OpenClaw] HTTP send: all endpoint/auth combinations failed');
    return null;
  }

  // Send a composing (typing) presence update to the target so the customer
  // sees the "..." indicator on their WhatsApp before the reply arrives.
  // Tries multiple auth formats against the gateway HTTP API — whichever works.
  async sendComposingPresence(to) {
    const target = normalizeE164(to);
    if (!target || !OPENCLAW_GATEWAY_URL) return false;

    const httpBase = OPENCLAW_GATEWAY_URL.replace(/^ws(s?)/, 'http$1').replace(/\/$/, '');
    const token = OPENCLAW_GATEWAY_TOKEN;
    if (!token) return false;

    const isLocalhostUrl = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(httpBase);

    if (isLocalhostUrl) {
      // The backend typically runs on a different machine than the gateway container.
      // If the gateway URL is localhost/127.0.0.1, send presence from the gateway host via SSH + docker exec.
      const payload = JSON.stringify({
        target,
        state: 'composing',
        account: OPENCLAW_WHATSAPP_ACCOUNT || undefined,
      });

      const endpoint = `${httpBase}/api/channels/whatsapp/presence`;
      const nodeProbe =
        `node -e ` +
        `'const [url, token, body] = process.argv.slice(2);` +
        `const u = new URL(url);` +
        `const lib = u.protocol === \"https:\" ? require(\"https\") : require(\"http\");` +
        `const opts = { method: \"POST\", hostname: u.hostname, port: u.port || (u.protocol === \"https:\" ? 443 : 80), path: u.pathname + u.search, headers: { \"Content-Type\": \"application/json\", \"Authorization\": \"Bearer \" + token, \"Content-Length\": Buffer.byteLength(body) } };` +
        `const req = lib.request(opts, (res) => { res.resume(); console.log(res.statusCode || 0); });` +
        `req.on(\"error\", (e) => { console.error(e && e.message ? e.message : String(e)); process.exit(2); });` +
        `req.write(body); req.end();' ` +
        `\"${shellEscapeSingleQuoted(endpoint)}\" \"${shellEscapeSingleQuoted(token)}\" \"${shellEscapeSingleQuoted(payload)}\"`;

      const script =
        `set -eu; ` +
        `URL='${shellEscapeSingleQuoted(endpoint)}'; ` +
        `TOKEN='${shellEscapeSingleQuoted(token)}'; ` +
        `BODY='${shellEscapeSingleQuoted(payload)}'; ` +
        `CODE=\"$(${nodeProbe} 2>/dev/null || echo 0)\"; ` +
        `echo \"$CODE\"`;

      const { code, stdout, stderr } = await runSshCommand({
        remoteCommand: wrapInDockerExec(script),
        stdinPayload: null,
      });

      const status = String(stdout || '').trim();
      if (code === 0 && /^2\d\d$/.test(status)) {
        console.log(`[OpenClaw] Composing presence sent to ${target} (ssh)`);
        return true;
      }

      if (stderr) {
        console.warn(`[OpenClaw] Presence via SSH failed:`, String(stderr).trim().slice(0, 200));
      }

      return false;
    }

    const authHeaders = [
      { 'Authorization': `Bearer ${token}` },
      { 'X-OpenClaw-Token': token },
      { 'X-Gateway-Token': token },
      { 'X-Token': token },
      { 'Authorization': `Token ${token}` },
    ];

    for (const extra of authHeaders) {
      try {
        const res = await fetch(`${httpBase}/api/channels/whatsapp/presence`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...extra },
          body: JSON.stringify({ target, state: 'composing', account: OPENCLAW_WHATSAPP_ACCOUNT || undefined }),
          signal: AbortSignal.timeout(5000),
        });
        if (res.ok) {
          console.log(`[OpenClaw] Composing presence sent to ${target}`);
          return true;
        }
      } catch { /* try next format */ }
    }

    console.warn(`[OpenClaw] Could not send composing presence to ${target} — all auth formats failed`);
    return false;
  }

  async sendMessage(to, message) {
    const rawTo = String(to || '').trim();
    const target = normalizeE164(to);
    const trimmedMessage = String(message || '').trim();

    if (!target) {
      return {
        success: false,
        error: 'Missing/invalid WhatsApp target number',
        details: rawTo ? `Invalid target: ${rawTo}` : null,
      };
    }
    if (!trimmedMessage) {
      return { success: false, error: 'Missing message body' };
    }

    // When a public gateway URL is set (e.g. Cloudflare tunnel on Render), skip SSH entirely
    // and use the HTTP REST API. SSH only works from the local LAN.
    if (!isLocalhostGatewayUrl(OPENCLAW_GATEWAY_URL)) {
      const httpResult = await this.sendMessageViaHttp(target, trimmedMessage);
      if (httpResult) return httpResult;
      // HTTP failed — log and fall through to SSH as last resort
      console.warn('[OpenClaw] HTTP send failed; falling back to SSH');
    }

    const remoteGatewayUrl = OPENCLAW_GATEWAY_URL || 'ws://127.0.0.1:30080';
    const tokenArg = OPENCLAW_GATEWAY_TOKEN ? ` --token '${shellEscapeSingleQuoted(OPENCLAW_GATEWAY_TOKEN)}'` : '';
    const cli = shellEscapeSingleQuoted(getOpenClawCliForRuntime());

    // IMPORTANT: don't use `gateway call agent --deliver` for raw WhatsApp sends.
    // If the agent/models fail, the gateway can still deliver an error message to the customer.
    // Use the non-LLM send path instead: `openclaw message send ...`.
    const accountArg = OPENCLAW_WHATSAPP_ACCOUNT
      ? ` --account '${shellEscapeSingleQuoted(OPENCLAW_WHATSAPP_ACCOUNT)}'`
      : '';
    // Pipe message via stdin — openclaw message send reads the body from stdin.
    // NOTE: OpenClaw CLI variants differ; we try `--message` first, then stdin fallback.
    const runAndParse = async ({ remoteCommand, stdinPayload }) => {
      const { code, stdout, stderr, timedOut } = await runSshCommand({ remoteCommand, stdinPayload });

      if (timedOut) {
        return {
          success: false,
          error: 'OpenClaw WhatsApp send timed out',
          details: `Timeout ${OPENCLAW_RPC_TIMEOUT_MS}ms`,
        };
      }

      if (code !== 0) {
        const stderrText = String(stderr || '').trim();
        const stdoutText = String(stdout || '').trim();
        const combined = [
          stderrText ? `[stderr]\n${stderrText}` : '',
          stdoutText ? `[stdout]\n${stdoutText}` : '',
        ]
          .filter(Boolean)
          .join('\n\n')
          .slice(0, 1200);

        return {
          success: false,
          error: `OpenClaw WhatsApp send failed (ssh exit ${code})`,
          details: combined || String(stderr || stdout || '').slice(0, 800),
        };
      }

      const parsed = parseJsonObject(stdout);
      const providerError = extractProviderErrorFromOpenClawResponse(parsed);
      if (providerError) {
        return {
          success: false,
          error: 'OpenClaw WhatsApp send failed (provider error)',
          details: providerError,
          raw: parsed || stdout.slice(0, 2000),
        };
      }

      const messageId = parsed?.messageId || parsed?.id || parsed?.data?.id || parsed?.result?.id || null;
      return { success: true, messageId, raw: parsed || stdout.slice(0, 2000) };
    };

    const sendForTarget = async (targetCandidate) => {
      const innerScriptWithMessage =
        `set -eu; ` +
        `TARGET='${shellEscapeSingleQuoted(targetCandidate)}'; ` +
        `MSG='${shellEscapeSingleQuoted(trimmedMessage)}'; ` +
        `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 '${cli}' message send --json --channel whatsapp ` +
        `--target "$TARGET"${accountArg} --message "$MSG"`;

      const innerScriptViaStdin =
        `set -eu; ` +
        `TARGET='${shellEscapeSingleQuoted(targetCandidate)}'; ` +
        `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 '${cli}' message send --json --channel whatsapp ` +
        `--target "$TARGET"${accountArg}`;

      // Prefer `--message` (newer OpenClaw CLIs require it). If the CLI doesn't support it,
      // fall back to piping the message via stdin.
      const firstAttempt = await runAndParse({
        remoteCommand: wrapInDockerExec(innerScriptWithMessage),
        stdinPayload: null,
      });

      if (firstAttempt?.success) return firstAttempt;

      const firstDetails = String(firstAttempt?.details || '');
      const messageFlagUnsupported =
        /unknown (option|flag).*--message/i.test(firstDetails) ||
        /unrecognized (option|argument).*--message/i.test(firstDetails) ||
        /unexpected argument.*--message/i.test(firstDetails);

      // Keep these available as a break-glass fallback when debugging, but default to `message send`.
      void remoteGatewayUrl;
      void tokenArg;
      void OPENCLAW_WHATSAPP_AGENT_ID;

      if (!messageFlagUnsupported) return firstAttempt;

      console.warn('[OpenClaw] CLI does not support --message; retrying WhatsApp send via stdin');

      return await runAndParse({
        remoteCommand: wrapInDockerExec(innerScriptViaStdin),
        stdinPayload: trimmedMessage,
      });
    };

    const isTargetValidationError = (details = '') =>
      /requires target/i.test(details) ||
      /invalid target/i.test(details) ||
      /target\s*<.*e\.?164/i.test(details) ||
      /group jid/i.test(details);

    const digits = String(target || '').replace(/[^\d]/g, '');
    const targetCandidates = Array.from(
      new Set(
        [
          target,
          target ? `whatsapp:${target}` : null,
          digits && target.startsWith('+') ? digits : null,
          digits ? `+${digits}` : null,
          digits ? `whatsapp:+${digits}` : null,
          digits ? `${digits}@s.whatsapp.net` : null,
        ].filter(Boolean)
      )
    ).slice(0, 6);

    let lastResult = null;
    for (const candidate of targetCandidates) {
      if (candidate !== target) {
        console.warn(`[OpenClaw] Retrying WhatsApp send with alternate target format: ${candidate}`);
      }
      const result = await sendForTarget(candidate);
      if (result?.success) return result;

      lastResult = result;
      const details = String(result?.details || result?.error || '');
      if (!isTargetValidationError(details)) return result;
    }

    const lastDetails = String(lastResult?.details || lastResult?.error || '');
    if (lastResult && isTargetValidationError(lastDetails)) {
      try {
        const diagTarget = targetCandidates?.[0] || target;
        const diagnosticScript =
          `set -eu; ` +
          `TARGET='${shellEscapeSingleQuoted(diagTarget)}'; ` +
          `echo '[diagnostic] target='\"$TARGET\"; ` +
          `echo '[diagnostic] target_len='\"$(printf %s \"$TARGET\" | wc -c | tr -d ' ')\"; ` +
          `echo '[diagnostic] argv_probe_start'; ` +
          `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 '${cli}' message send --dry-run --json --verbose --channel whatsapp --target \"$TARGET\" --message 'ping' 2>&1 | head -n 60 || true; ` +
          `echo '[diagnostic] argv_probe_end'; ` +
          `echo '---'; ` +
          `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 '${cli}' message send --help | head -n 120 || true; ` +
          `echo '---'; ` +
          `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 '${cli}' message send --help | grep -i target | head -n 20 || true`;

        const diagResult = await runSshCommand({ remoteCommand: wrapInDockerExec(diagnosticScript), stdinPayload: null });
        const combined = [
          diagResult?.stderr ? `[stderr]\n${String(diagResult.stderr)}` : '',
          diagResult?.stdout ? `[stdout]\n${String(diagResult.stdout)}` : '',
        ]
          .filter(Boolean)
          .join('\n\n');
        const helpText = String(combined || '').slice(0, 4000);
        if (helpText) {
          const augmented = {
            ...lastResult,
            details: `${lastDetails}\n\n[diagnostic] openclaw message send diagnostics (first 4000 chars):\n${helpText}`,
          };
          console.warn('[OpenClaw] Target validation persisted; included CLI help in error details');
          return augmented;
        }
      } catch {
        // ignore diagnostic failures
      }
    }

    return lastResult || { success: false, error: 'OpenClaw WhatsApp send failed' };
  }
}

module.exports = new OpenClawWhatsAppService();

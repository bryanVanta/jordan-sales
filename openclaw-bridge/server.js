const express = require('express');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 31000);
const DOCKER_CONTAINER = (process.env.OPENCLAW_DOCKER_CONTAINER || 'openclaw-sales-bot').trim();
const OPENCLAW_GATEWAY_WS_URL = (process.env.OPENCLAW_GATEWAY_WS_URL || 'ws://127.0.0.1:30080').trim();
const OPENCLAW_AGENT_ID = (process.env.OPENCLAW_AGENT_ID || 'main').trim();
const OPENCLAW_TIMEOUT_MS = Number(process.env.OPENCLAW_TIMEOUT_MS || 300000);
const OPENCLAW_BRIDGE_DEBUG = String(process.env.OPENCLAW_BRIDGE_DEBUG || '').trim() === '1';

const parseJsonObject = (text = '') => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // continue
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // continue
    }
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

const extractLeadsFromPayload = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.leads)) return payload.leads;
  if (Array.isArray(payload?.data?.leads)) return payload.data.leads;
  if (Array.isArray(payload?.results)) return payload.results;
  if (Array.isArray(payload?.payloads)) return payload.payloads;
  if (Array.isArray(payload?.result?.leads)) return payload.result.leads;
  if (Array.isArray(payload?.result?.data?.leads)) return payload.result.data.leads;
  return [];
};

const normalizeLead = (lead = {}, fallbackLocation = '') => ({
  companyName: lead.companyName || lead.company || '',
  website: lead.website || lead.url || '',
  location: lead.location || fallbackLocation,
  email: lead.email || '',
  phone: lead.phone || '',
  contactName: lead.contactName || lead.person || '',
  channel: lead.channel || '',
  notes: lead.notes || lead.intent || '',
});

const buildJordanPrompt = (productInfo = {}, previousCompanies = []) => {
  const productName = productInfo.productName || productInfo.name || 'the product';
  const location = productInfo.location || productInfo.country || 'the target area';
  const targetCustomer = productInfo.targetCustomer || productInfo.target || '';
  const description = productInfo.description || '';
  const exclude = Array.isArray(previousCompanies) && previousCompanies.length > 0 ? previousCompanies : [];

  return (
    `You are a lead finder. Find REAL companies that match the target customer for a sales outreach campaign.\n\n` +
    `Product: ${productName}\n` +
    (description ? `Description: ${description}\n` : '') +
    (targetCustomer ? `Target customer: ${targetCustomer}\n` : '') +
    `Location focus: ${location}\n\n` +
    (exclude.length
      ? `CRITICAL: Do NOT return any of these previously-contacted companies:\n- ${exclude.join('\n- ')}\n\n`
      : '') +
    `Return up to 50 leads as JSON with key "leads" (array). Each lead should include: companyName, website, location, email, phone, contactName, channel, notes.\n`
  );
};

const getTokenFromRequest = (req) => {
  const headerToken =
    req.headers['x-gateway-token'] ||
    req.headers['x-openclaw-token'] ||
    req.headers['x-openclaw-gateway-token'] ||
    '';

  if (typeof headerToken === 'string' && headerToken.trim()) return headerToken.trim();

  const auth = req.headers.authorization || '';
  if (typeof auth === 'string' && auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();

  return '';
};

const callOpenClawViaDocker = async ({ agentId, message, token, timeoutMs }) => {
  const params = {
    agentId,
    idempotencyKey: `bridge-${randomUUID()}`,
    message,
    timeout: Math.ceil(timeoutMs / 1000),
  };

  const paramsJson = JSON.stringify(params);

  // Read JSON from stdin and pass it to openclaw as a string.
  // Running inside the container avoids needing openclaw installed on the host.
  const tokenArg = token ? ` --token '${String(token).replace(/'/g, `'\"'\"'`)}'` : '';
  const cmd =
    `PARAMS="$(cat)"; ` +
    `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 ` +
    `openclaw gateway call agent --json --expect-final ` +
    `--url '${String(OPENCLAW_GATEWAY_WS_URL).replace(/'/g, `'\"'\"'`)}' ` +
    `--params "$PARAMS"${tokenArg} ` +
    `--timeout ${timeoutMs}`;

  return await new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', DOCKER_CONTAINER, 'sh', '-lc', cmd], {
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';

    const killTimer = setTimeout(() => {
      child.kill();
      reject(new Error(`openclaw bridge timed out after ${timeoutMs}ms`));
    }, timeoutMs + 5000);

    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });

    child.on('close', (code) => {
      clearTimeout(killTimer);
      if (code !== 0) {
        reject(new Error((stderr || stdout || '').trim().slice(0, 500) || `docker exec exit ${code}`));
        return;
      }
      resolve({ stdout, stderr });
    });

    child.on('error', (err) => {
      clearTimeout(killTimer);
      reject(err);
    });

    child.stdin.write(paramsJson);
    child.stdin.end();
  });
};

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Compatibility endpoint: matches the backend's legacy HTTP transport.
app.post('/jordan/find-leads', async (req, res) => {
  const startMs = Date.now();
  try {
    const body = req.body || {};
    const productInfo = body.productInfo || {};
    const previousCompanies = body.previousCompanies || [];
    const context = body.context || {};

    const agentId = (context.agentId || OPENCLAW_AGENT_ID || 'main').toString();
    const token = getTokenFromRequest(req);

    const message = buildJordanPrompt(productInfo, previousCompanies);
    const { stdout } = await callOpenClawViaDocker({
      agentId,
      message,
      token,
      timeoutMs: OPENCLAW_TIMEOUT_MS,
    });

    const parsed = parseJsonObject(stdout);
    const rawLeads = extractLeadsFromPayload(parsed?.result || parsed);
    const leads = Array.isArray(rawLeads)
      ? rawLeads.map((l) => normalizeLead(l, productInfo.location || '')).filter((l) => l.companyName || l.website)
      : [];

    const debugRequested = OPENCLAW_BRIDGE_DEBUG || String(req.query?.debug || '') === '1';
    if (debugRequested && leads.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[openclaw-bridge] 0 leads; stdout preview:', String(stdout || '').slice(0, 2000));
    }

    res.status(200).json({
      leads,
      ...(debugRequested
        ? {
            debug: {
              tookMs: Date.now() - startMs,
              stdoutPreview: String(stdout || '').slice(0, 2000),
              parsedType: parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed,
              parsedKeys: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).slice(0, 50) : [],
            },
          }
        : {}),
    });
  } catch (err) {
    res.status(502).json({ error: 'OpenClaw bridge failed', details: String(err.message || err) });
  }
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[openclaw-bridge] listening on http://0.0.0.0:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[openclaw-bridge] docker container: ${DOCKER_CONTAINER}`);
  // eslint-disable-next-line no-console
  console.log(`[openclaw-bridge] gateway ws url: ${OPENCLAW_GATEWAY_WS_URL}`);
});

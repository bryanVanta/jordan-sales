/**
 * OpenClaw Service
 * Optional integration point for an external lead-finding agent via:
 * 1) Gateway RPC method "agent" (preferred)
 * 2) Legacy HTTP endpoint (fallback)
 *
 * Expected response shape:
 * {
 *   "leads": [
 *     {
 *       "companyName": "Acme Hotel",
 *       "website": "https://acme.com",
 *       "location": "Kuala Lumpur, Malaysia",
 *       "email": "sales@acme.com",
 *       "phone": "+60312345678",
 *       "contactName": "Jane Doe",
 *       "channel": "email",
 *       "notes": "official website"
 *     }
 *   ]
 * }
 */

const axios = require('axios');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const OPENCLAW_JORDAN_GATEWAY_BASE_URL = process.env.OPENCLAW_JORDAN_GATEWAY_BASE_URL;
const OPENCLAW_JORDAN_REMOTE_GATEWAY_URL = process.env.OPENCLAW_JORDAN_REMOTE_GATEWAY_URL;
const OPENCLAW_JORDAN_GATEWAY_TOKEN = process.env.OPENCLAW_JORDAN_GATEWAY_TOKEN;
const OPENCLAW_JORDAN_ENDPOINT = process.env.OPENCLAW_JORDAN_ENDPOINT || '/jordan/find-leads';
const OPENCLAW_JORDAN_AGENT_URL = process.env.OPENCLAW_JORDAN_AGENT_URL;
const OPENCLAW_JORDAN_API_KEY = process.env.OPENCLAW_JORDAN_API_KEY;
const OPENCLAW_JORDAN_AGENT_ID = process.env.OPENCLAW_JORDAN_AGENT_ID || 'jordan-sales-agent';
const OPENCLAW_JORDAN_WORKFLOW_ID = process.env.OPENCLAW_JORDAN_WORKFLOW_ID || 'jordan-find-leads';
const OPENCLAW_JORDAN_BOT_NAME = process.env.OPENCLAW_JORDAN_BOT_NAME || 'Jordan';
const OPENCLAW_JORDAN_NAMESPACE = process.env.OPENCLAW_JORDAN_NAMESPACE || 'jordan-sales';
const OPENCLAW_JORDAN_TRANSPORT = (process.env.OPENCLAW_JORDAN_TRANSPORT || 'rpc').trim().toLowerCase();
const OPENCLAW_JORDAN_RPC_TIMEOUT_MS = Number(process.env.OPENCLAW_JORDAN_RPC_TIMEOUT_MS || 120000);
const MAX_LEADS = 5;

const normalizeOpenClawLead = (lead = {}, fallbackLocation = '') => ({
  companyName: lead.companyName || lead.company || '',
  website: lead.website || lead.url || '',
  location: lead.location || fallbackLocation,
  email: lead.email || '',
  phone: lead.phone || '',
  contactName: lead.contactName || lead.person || '',
  channel: lead.channel || '',
  notes: lead.notes || lead.intent || '',
});

const getJordanGatewayUrl = () => {
  if (OPENCLAW_JORDAN_AGENT_URL) {
    return OPENCLAW_JORDAN_AGENT_URL;
  }

  if (!OPENCLAW_JORDAN_GATEWAY_BASE_URL) {
    return '';
  }

  const base = OPENCLAW_JORDAN_GATEWAY_BASE_URL.replace(/\/$/, '');
  const path = OPENCLAW_JORDAN_ENDPOINT.startsWith('/') ? OPENCLAW_JORDAN_ENDPOINT : `/${OPENCLAW_JORDAN_ENDPOINT}`;
  return `${base}${path}`;
};

const getJordanGatewayWsUrl = () => {
  if (!OPENCLAW_JORDAN_GATEWAY_BASE_URL) {
    return '';
  }

  const raw = OPENCLAW_JORDAN_GATEWAY_BASE_URL.trim();
  if (raw.startsWith('ws://') || raw.startsWith('wss://')) {
    return raw;
  }
  if (raw.startsWith('http://')) {
    return raw.replace(/^http:\/\//, 'ws://');
  }
  if (raw.startsWith('https://')) {
    return raw.replace(/^https:\/\//, 'wss://');
  }
  return `ws://${raw}`;
};

const collectStringValues = (input, limit = 30) => {
  const values = [];
  const queue = [input];

  while (queue.length > 0 && values.length < limit) {
    const current = queue.shift();
    if (!current) continue;

    if (typeof current === 'string') {
      values.push(current);
      continue;
    }

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    if (typeof current === 'object') {
      Object.values(current).forEach((value) => queue.push(value));
    }
  }

  return values;
};

const parseJsonObject = (text = '') => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;

  try {
    return JSON.parse(trimmed);
  } catch {
    // Continue with extraction attempts.
  }

  const fenced = trimmed.match(/```json\s*([\s\S]*?)```/i) || trimmed.match(/```\s*([\s\S]*?)```/i);
  if (fenced && fenced[1]) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // Continue with bracket extraction.
    }
  }

  const startObj = trimmed.indexOf('{');
  const endObj = trimmed.lastIndexOf('}');
  if (startObj >= 0 && endObj > startObj) {
    const candidate = trimmed.slice(startObj, endObj + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // No-op.
    }
  }

  const startArr = trimmed.indexOf('[');
  const endArr = trimmed.lastIndexOf(']');
  if (startArr >= 0 && endArr > startArr) {
    const candidate = trimmed.slice(startArr, endArr + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // No-op.
    }
  }

  return null;
};

const extractLeadsFromPayload = (payload) => {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.leads)) return payload.leads;
  if (Array.isArray(payload.data?.leads)) return payload.data.leads;
  if (Array.isArray(payload.results)) return payload.results;
  if (Array.isArray(payload.result?.leads)) return payload.result.leads;
  if (Array.isArray(payload.payload?.leads)) return payload.payload.leads;
  if (Array.isArray(payload.result?.result?.leads)) return payload.result.result.leads;

  const strings = collectStringValues(payload);
  for (const text of strings) {
    const parsed = parseJsonObject(text);
    if (!parsed) continue;
    const parsedLeads = extractLeadsFromPayload(parsed);
    if (parsedLeads.length > 0) {
      return parsedLeads;
    }
  }

  return [];
};

const buildJordanPrompt = (productInfo = {}) => JSON.stringify({
  task: 'Find up to 5 leads that match this product and target customer profile.',
  output: {
    instruction: 'Return ONLY strict JSON with this exact shape: {"leads":[...]} and no extra text.',
    leadShape: {
      company: 'string',
      person: 'string',
      email: 'string',
      phone: 'string',
      location: 'string',
      intent: 'string',
      channel: 'Email|Phone|Whatsapp|LinkedIn|Other',
      website: 'string',
    },
    constraints: {
      maxLeads: MAX_LEADS,
      preferPublicBusinessContacts: true,
      noFabrication: true,
    },
  },
  context: {
    agentId: OPENCLAW_JORDAN_AGENT_ID,
    workflowId: OPENCLAW_JORDAN_WORKFLOW_ID,
    botName: OPENCLAW_JORDAN_BOT_NAME,
    namespace: OPENCLAW_JORDAN_NAMESPACE,
  },
  productInfo,
});

async function findLeadsWithOpenClawCliViaSsh(productInfo) {
  const wsUrl = getJordanGatewayWsUrl();
  if (!wsUrl) {
    console.error('[OpenClaw] No gateway URL configured');
    return [];
  }

  return new Promise((resolve) => {
    try {
      const params = {
        agentId: OPENCLAW_JORDAN_AGENT_ID || 'main',
        idempotencyKey: `jordan-leads-${randomUUID()}`,
        message: buildJordanPrompt(productInfo),
        timeout: Math.ceil(OPENCLAW_JORDAN_RPC_TIMEOUT_MS / 1000),
      };

      const paramsJson = JSON.stringify(params);

      // Build remote command that reads params from stdin into a variable,
      // then passes it to openclaw (since --params expects a JSON string, not a file path)
      // Use OPENCLAW_JORDAN_REMOTE_GATEWAY_URL for the remote SSH-executed command
      // (not the localhost tunnel URL)
      const remoteGatewayUrl = OPENCLAW_JORDAN_REMOTE_GATEWAY_URL || wsUrl;
      const tokenArg = OPENCLAW_JORDAN_GATEWAY_TOKEN ? ` --token '${OPENCLAW_JORDAN_GATEWAY_TOKEN}'` : '';
      const remoteCommand = `PARAMS="$(cat)"; OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 /home/jeff/.npm-global/bin/openclaw gateway call agent --json --expect-final --url '${remoteGatewayUrl}' --params "$PARAMS"${tokenArg} --timeout ${OPENCLAW_JORDAN_RPC_TIMEOUT_MS}`;

      console.log('[OpenClaw] Spawning SSH process to Ubuntu...');

      // SSH must be non-interactive: BatchMode=yes disables password prompts
      // Stdin is reserved for params JSON, not authentication
      const sshProcess = spawn('ssh', [
        '-o', 'BatchMode=yes',
        'jeff@192.168.100.199',
        remoteCommand,
      ], {
        timeout: OPENCLAW_JORDAN_RPC_TIMEOUT_MS + 15000,
        maxBuffer: 1024 * 1024 * 4,
      });

      let stdout = '';
      let stderr = '';

      // Collect stdout (the JSON response)
      sshProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      // Collect stderr (errors/logs)
      sshProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      // Handle process completion
      sshProcess.on('close', (code) => {
        if (code !== 0) {
          // Check for SSH auth failures
          if (code === 255 || stderr.includes('Permission denied') || stderr.includes('Authentications that can continue')) {
            console.error('[OpenClaw] ❌ SSH key-based auth is required for OpenClaw stdin piping');
            console.error('[OpenClaw] Setup SSH key with: ssh-copy-id jeff@192.168.100.199');
            console.error('[OpenClaw] Test with: ssh -o BatchMode=yes jeff@192.168.100.199 "echo ok"');
            resolve([]);
            return;
          }

          console.error('[OpenClaw] Remote command failed with exit code:', code);
          if (stderr) {
            console.error('[OpenClaw] stderr:', stderr.slice(0, 500));
          }
          resolve([]);
          return;
        }

        if (!stdout) {
          console.error('[OpenClaw] No output received from remote command');
          resolve([]);
          return;
        }

        try {
          console.log('[OpenClaw] Response received, parsing...');
          const parsed = parseJsonObject(stdout);

          if (!parsed) {
            console.error('[OpenClaw] Failed to parse JSON response');
            resolve([]);
            return;
          }

          const rawLeads = extractLeadsFromPayload(parsed?.result || parsed);
          console.log(`[OpenClaw] ✓ Found ${rawLeads.length} leads`);

          const leads = Array.isArray(rawLeads)
            ? rawLeads.map((lead) => normalizeOpenClawLead(lead, productInfo.location || '')).slice(0, MAX_LEADS)
            : [];

          resolve(leads);
        } catch (parseError) {
          console.error('[OpenClaw] Error parsing response:', parseError.message);
          resolve([]);
        }
      });

      // Handle process errors
      sshProcess.on('error', (error) => {
        console.error('[OpenClaw] SSH spawn error:', error.message);
        resolve([]);
      });

      // Send params JSON to stdin
      console.log('[OpenClaw] Sending params to stdin...');
      sshProcess.stdin.write(paramsJson);
      sshProcess.stdin.end();

    } catch (error) {
      console.error('[OpenClaw] Unexpected error:', error.message);
      resolve([]);
    }
  });
}

async function findLeadsWithOpenClawHttp(productInfo) {
  const gatewayUrl = getJordanGatewayUrl();

  if (!gatewayUrl) {
    return [];
  }

  try {
    const response = await axios.post(
      gatewayUrl,
      {
        context: {
          agentId: OPENCLAW_JORDAN_AGENT_ID,
          workflowId: OPENCLAW_JORDAN_WORKFLOW_ID,
          botName: OPENCLAW_JORDAN_BOT_NAME,
          namespace: OPENCLAW_JORDAN_NAMESPACE,
        },
        productInfo,
        constraints: {
          maxLeads: MAX_LEADS,
          displayFieldsOnly: ['company', 'person', 'email', 'location', 'temp', 'status', 'intent', 'next', 'channel'],
        },
      },
      {
        headers: {
          'Content-Type': 'application/json',
          ...(OPENCLAW_JORDAN_API_KEY ? { Authorization: `Bearer ${OPENCLAW_JORDAN_API_KEY}` } : {}),
          ...(OPENCLAW_JORDAN_GATEWAY_TOKEN ? { 'x-gateway-token': OPENCLAW_JORDAN_GATEWAY_TOKEN } : {}),
          ...(OPENCLAW_JORDAN_GATEWAY_TOKEN ? { 'x-openclaw-token': OPENCLAW_JORDAN_GATEWAY_TOKEN } : {}),
        },
        timeout: 30000,
      }
    );

    const rawLeads = response.data?.leads || response.data?.data?.leads || response.data?.results || [];
    return Array.isArray(rawLeads)
      ? rawLeads.map((lead) => normalizeOpenClawLead(lead, productInfo.location || '')).slice(0, MAX_LEADS)
      : [];
  } catch (error) {
    console.error('OpenClaw HTTP lead search failed:', error.response?.data || error.message);
    return [];
  }
}

async function findLeadsWithOpenClaw(productInfo) {
  if (!OPENCLAW_JORDAN_GATEWAY_BASE_URL && !OPENCLAW_JORDAN_AGENT_URL) {
    return [];
  }

  if (OPENCLAW_JORDAN_TRANSPORT === 'http') {
    return findLeadsWithOpenClawHttp(productInfo);
  }

  try {
    return await findLeadsWithOpenClawCliViaSsh(productInfo);
  } catch (error) {
    console.error('OpenClaw CLI call failed:', error.message);
    return findLeadsWithOpenClawHttp(productInfo);
  }
}

module.exports = {
  findLeadsWithOpenClaw,
};

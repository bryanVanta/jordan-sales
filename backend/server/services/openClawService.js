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
const { execFile } = require('child_process');
const { randomUUID } = require('crypto');
const { promisify } = require('util');

const execFileAsync = promisify(execFile);

const OPENCLAW_JORDAN_GATEWAY_BASE_URL = process.env.OPENCLAW_JORDAN_GATEWAY_BASE_URL;
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

async function findLeadsWithOpenClawRpc(productInfo) {
  const wsUrl = getJordanGatewayWsUrl();
  if (!wsUrl) return [];

  const params = {
    agentId: OPENCLAW_JORDAN_AGENT_ID || 'main',
    idempotencyKey: `jordan-leads-${randomUUID()}`,
    message: buildJordanPrompt(productInfo),
    timeout: Math.ceil(OPENCLAW_JORDAN_RPC_TIMEOUT_MS / 1000),
  };

  const args = [
    'gateway', 'call', 'agent',
    '--json',
    '--expect-final',
    '--url', wsUrl,
    '--params', JSON.stringify(params),
  ];

  if (OPENCLAW_JORDAN_GATEWAY_TOKEN) {
    args.push('--token', OPENCLAW_JORDAN_GATEWAY_TOKEN);
  }
  args.push('--timeout', String(OPENCLAW_JORDAN_RPC_TIMEOUT_MS));

  const { stdout } = await execFileAsync('openclaw', args, {
    timeout: OPENCLAW_JORDAN_RPC_TIMEOUT_MS + 5000,
    maxBuffer: 1024 * 1024 * 4,
  });

  const parsed = parseJsonObject(stdout) || {};
  const rawLeads = extractLeadsFromPayload(parsed);

  return Array.isArray(rawLeads)
    ? rawLeads.map((lead) => normalizeOpenClawLead(lead, productInfo.location || '')).slice(0, MAX_LEADS)
    : [];
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
    return await findLeadsWithOpenClawRpc(productInfo);
  } catch (error) {
    console.error('OpenClaw RPC lead search failed:', error.message);
    return findLeadsWithOpenClawHttp(productInfo);
  }
}

module.exports = {
  findLeadsWithOpenClaw,
};

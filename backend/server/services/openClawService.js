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
const OPENCLAW_JORDAN_RPC_TIMEOUT_MS = Number(process.env.OPENCLAW_JORDAN_RPC_TIMEOUT_MS || 300000); // 5 minutes for expanded geographic search
const MAX_LEADS = 100; // Per-batch limit - reasonable for OpenClaw to handle reliably

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
  let url = '';
  
  if (OPENCLAW_JORDAN_AGENT_URL) {
    url = OPENCLAW_JORDAN_AGENT_URL;
  } else if (OPENCLAW_JORDAN_GATEWAY_BASE_URL) {
    const base = OPENCLAW_JORDAN_GATEWAY_BASE_URL.replace(/\/$/, '');
    const path = OPENCLAW_JORDAN_ENDPOINT.startsWith('/') ? OPENCLAW_JORDAN_ENDPOINT : `/${OPENCLAW_JORDAN_ENDPOINT}`;
    url = `${base}${path}`;
  } else {
    return '';
  }

  // Convert WebSocket URLs to HTTP for HTTP transport
  if (url.startsWith('ws://')) {
    return url.replace(/^ws:\/\//, 'http://');
  }
  if (url.startsWith('wss://')) {
    return url.replace(/^wss:\/\//, 'https://');
  }
  
  return url;
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

const buildJordanPrompt = (productInfo = {}, previousCompanies = []) => JSON.stringify({
  task: `Find up to ${MAX_LEADS} leads that match this product and target customer profile. Return diverse results from different companies, locations, and regions.`,
  searchStrategy: {
    diversification: 'CRITICAL: If you find the initial set of companies/locations exhausted, expand to other regions. For Malaysia: search beyond Kuala Lumpur (Selangor, Penang, Johor, Sabah, Sarawak). For hospitality: search resorts, guesthouses, vacation rentals, boutique accommodations. For retail: search different districts and shopping centers. For corporate: search different industries and company sizes.',
    geographicExpansion: 'If searching Malaysia, expand to: Selangor, Subang Jaya, Petaling Jaya, Shah Alam, Kuching, George Town, Johor Bahru, Kota Kinabalu, Ipoh, Melaka beyond the primary location.',
    minLeads: 50,
    targetLeads: MAX_LEADS,
  },
  exclusions: previousCompanies.length > 0 
    ? { 
        previouslyFoundCompanies: previousCompanies,
        instruction: `CRITICAL - DO NOT RETURN ANY OF THESE COMPANIES: ${previousCompanies.join(', ')}. Find completely different companies, locations, and regions. These have already been contacted. Search aggressively in new areas, different business types if applicable, and alternate locations.`
      }
    : { 
        previouslyFoundCompanies: [],
        instruction: 'No exclusions - search broadly for diverse leads across multiple locations and business types.'
      },
  output: {
    instruction: 'Return ONLY strict JSON with this exact shape: {"leads":[...]} and no extra text.',
    leadShape: {
      company: 'string',
      person: 'string',
      email: 'string',
      phone: 'phone',
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

async function findLeadsWithOpenClawCliViaSsh(productInfo, previousCompanies = []) {
  const wsUrl = getJordanGatewayWsUrl();
  if (!wsUrl) {
    console.error('[OpenClaw] No gateway URL configured');
    return [];
  }

  return new Promise((resolve, reject) => {
    try {
      const params = {
        agentId: OPENCLAW_JORDAN_AGENT_ID || 'main',
        idempotencyKey: `jordan-leads-${randomUUID()}`,
        message: buildJordanPrompt(productInfo, previousCompanies),
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
        // Check for SSH auth failures or non-zero exit codes
        if (code === 255 || code !== 0 || stderr.includes('Permission denied') || stderr.includes('Authentications that can continue')) {
          if (code === 255 || stderr.includes('Permission denied')) {
            console.error('[OpenClaw] ❌ SSH key-based auth is required for OpenClaw stdin piping');
            console.error('[OpenClaw] Setup SSH key with: ssh-copy-id jeff@192.168.100.199');
            console.error('[OpenClaw] Test with: ssh -o BatchMode=yes jeff@192.168.100.199 "echo ok"');
          } else {
            console.error('[OpenClaw] Remote command failed with exit code:', code);
            if (stderr) {
              console.error('[OpenClaw] stderr:', stderr.slice(0, 500));
            }
          }
          console.log('[OpenClaw] ⚠️ SSH failed, falling back to HTTP gateway...');
          reject(new Error('SSH command failed: ' + (stderr.split('\n')[0] || `exit code ${code}`)));
          return;
        }

        if (!stdout) {
          console.error('[OpenClaw] No output received from remote command');
          console.log('[OpenClaw] ⚠️ No output, falling back to HTTP gateway...');
          reject(new Error('SSH: No output received'));
          return;
        }

        try {
          console.log('[OpenClaw] Response received, parsing...');
          const parsed = parseJsonObject(stdout);

          if (!parsed) {
            console.error('[OpenClaw] Failed to parse JSON response');
            console.log('[OpenClaw] ⚠️ Parse error, falling back to HTTP gateway...');
            reject(new Error('SSH: Failed to parse response'));
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
          console.log('[OpenClaw] ⚠️ Parse exception, falling back to HTTP gateway...');
          reject(new Error('SSH: Parse error - ' + parseError.message));
        }
      });

      // Handle process errors
      sshProcess.on('error', (error) => {
        console.error('[OpenClaw] SSH spawn error:', error.message);
        console.log('[OpenClaw] ⚠️ SSH error, falling back to HTTP gateway...');
        reject(new Error('SSH spawn failed: ' + error.message));
      });

      // Send params JSON to stdin
      console.log('[OpenClaw] Sending params to stdin...');
      sshProcess.stdin.write(paramsJson);
      sshProcess.stdin.end();

    } catch (error) {
      console.error('[OpenClaw] Unexpected error:', error.message);
      console.log('[OpenClaw] ⚠️ Unexpected error, falling back to HTTP gateway...');
      reject(new Error('SSH setup failed: ' + error.message));
    }
  });
}

async function findLeadsWithOpenClawHttp(productInfo, previousCompanies = []) {
  const gatewayUrl = getJordanGatewayUrl();

  if (!gatewayUrl) {
    console.error('[OpenClaw] No HTTP gateway URL configured');
    return [];
  }

  console.log('[OpenClaw] HTTP gateway URL:', gatewayUrl);

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
        previousCompanies,
        constraints: {
          maxLeads: MAX_LEADS,
          displayFieldsOnly: ['company', 'person', 'email', 'location', 'temp', 'status', 'intent', 'next', 'channel'],
          excludePreviouslySearched: previousCompanies.length > 0 ? `CRITICAL - DO NOT RETURN ANY OF THESE: ${previousCompanies.join(', ')}. Find completely different companies.` : 'None',
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
    console.log('[OpenClaw] HTTP response leads count:', rawLeads.length);
    return Array.isArray(rawLeads)
      ? rawLeads.map((lead) => normalizeOpenClawLead(lead, productInfo.location || '')).slice(0, MAX_LEADS)
      : [];
  } catch (error) {
    console.error('[OpenClaw] HTTP error:', error.message);
    if (error.response) {
      console.error('[OpenClaw] Response status:', error.response.status);
      console.error('[OpenClaw] Response data:', JSON.stringify(error.response.data).slice(0, 500));
    }
    return [];
  }
}

async function findLeadsWithOpenClaw(productInfo, previousCompanies = []) {
  if (!OPENCLAW_JORDAN_GATEWAY_BASE_URL && !OPENCLAW_JORDAN_AGENT_URL) {
    console.warn('[OpenClaw] ⚠️ No gateway configured, unable to search for leads');
    return [];
  }

  if (OPENCLAW_JORDAN_TRANSPORT === 'http') {
    console.log('[OpenClaw] Using HTTP transport');
    return findLeadsWithOpenClawHttp(productInfo, previousCompanies);
  }

  // Try SSH first, then HTTP fallback
  try {
    console.log('[OpenClaw] Attempting SSH transport (primary)...');
    return await findLeadsWithOpenClawCliViaSsh(productInfo, previousCompanies);
  } catch (sshError) {
    console.warn(`[OpenClaw] SSH transport failed: ${sshError.message}`);
    console.log('[OpenClaw] Attempting HTTP transport (fallback)...');
    try {
      return await findLeadsWithOpenClawHttp(productInfo, previousCompanies);
    } catch (httpError) {
      console.error(`[OpenClaw] HTTP transport also failed: ${httpError.message}`);
      console.error('[OpenClaw] ❌ All OpenClaw transports failed, no leads found');
      return [];
    }
  }
}

module.exports = {
  findLeadsWithOpenClaw,
};

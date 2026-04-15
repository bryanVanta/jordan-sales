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

const OPENCLAW_SSH_TARGET = (process.env.OPENCLAW_SSH_TARGET || 'jeff@192.168.100.199').trim();
const OPENCLAW_CLI_PATH = (process.env.OPENCLAW_CLI_PATH || '/home/jeff/.npm-global/bin/openclaw').trim();

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
const OPENCLAW_JORDAN_HTTP_TIMEOUT_MS = Number(process.env.OPENCLAW_JORDAN_HTTP_TIMEOUT_MS || OPENCLAW_JORDAN_RPC_TIMEOUT_MS || 30000);
const OPENCLAW_JORDAN_HTTP_POLL_INTERVAL_MS = Number(process.env.OPENCLAW_JORDAN_HTTP_POLL_INTERVAL_MS || 2000);
const MAX_LEADS = 100; // Per-batch limit - reasonable for OpenClaw to handle reliably

const truncateString = (value, maxLen) => {
  const text = String(value ?? '');
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, Math.max(0, maxLen - 1))}…`;
};

const pickProductInfoForLeadSearch = (input = {}) => {
  const productName = input.productName || input.name || '';
  const targetCustomer = input.targetCustomer || input.target || '';
  const location = input.location || input.locationFocus || input.country || '';
  const description = input.description || input.productDescription || input.summary || '';

  const servicesRaw = input.services || input.offerings || input.features || [];
  const services = Array.isArray(servicesRaw)
    ? servicesRaw.map((s) => truncateString(typeof s === 'string' ? s : JSON.stringify(s), 200)).slice(0, 12)
    : [];

  const keywordsRaw = input.keywords || input.tags || [];
  const keywords = Array.isArray(keywordsRaw)
    ? keywordsRaw.map((k) => truncateString(k, 60)).slice(0, 20)
    : [];

  return {
    productName: truncateString(productName, 120),
    description: truncateString(description, 1200),
    targetCustomer: truncateString(targetCustomer, 400),
    location: truncateString(location, 120),
    ...(services.length ? { services } : {}),
    ...(keywords.length ? { keywords } : {}),
  };
};

const shellEscapeSingleQuoted = (value = '') => String(value).replace(/'/g, `'\"'\"'`);

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

const buildJordanPrompt = (productInfo = {}, previousCompanies = []) => {
  const slimProductInfo = pickProductInfoForLeadSearch(productInfo);

  return JSON.stringify({
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
  productInfo: slimProductInfo,
});
};

async function findLeadsWithOpenClawCliViaSsh(productInfo, previousCompanies = []) {
  const wsUrl = getJordanGatewayWsUrl();
  const remoteGatewayUrl = OPENCLAW_JORDAN_REMOTE_GATEWAY_URL || wsUrl;
  if (!remoteGatewayUrl) {
    console.error('[OpenClaw] No remote gateway URL configured (set OPENCLAW_JORDAN_REMOTE_GATEWAY_URL)');
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
      const tokenArg = OPENCLAW_JORDAN_GATEWAY_TOKEN
        ? ` --token '${shellEscapeSingleQuoted(OPENCLAW_JORDAN_GATEWAY_TOKEN)}'`
        : '';
      const remoteCommand =
        `PARAMS="$(cat)"; ` +
        `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 ` +
        `'${shellEscapeSingleQuoted(OPENCLAW_CLI_PATH)}' gateway call agent --json --expect-final ` +
        `--url '${shellEscapeSingleQuoted(remoteGatewayUrl)}' --params "$PARAMS"${tokenArg} --timeout ${OPENCLAW_JORDAN_RPC_TIMEOUT_MS}`;

      console.log('[OpenClaw] Spawning SSH process to Ubuntu...');
      console.log('[OpenClaw] SSH target:', OPENCLAW_SSH_TARGET);
      console.log('[OpenClaw] Remote gateway URL:', remoteGatewayUrl);
      if (/^ws(s)?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(remoteGatewayUrl)) {
        console.warn('[OpenClaw] Remote gateway URL points to localhost. This will usually fail unless the gateway is running on the SSH host.');
      }

      // SSH must be non-interactive: BatchMode=yes disables password prompts
      // Stdin is reserved for params JSON, not authentication
      const sshProcess = spawn('ssh', [
        '-o', 'BatchMode=yes',
        OPENCLAW_SSH_TARGET,
        remoteCommand,
      ], { windowsHide: true });

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
              if (/gateway timeout/i.test(stderr)) {
                console.error('[OpenClaw] Hint: gateway timeout usually means the remote gateway URL/port is wrong or the gateway is down.');
              }
              if (/gateway token mismatch/i.test(stderr) || /unauthorized/i.test(stderr)) {
                console.error('[OpenClaw] Hint: unauthorized/token mismatch. Ensure backend OPENCLAW_JORDAN_GATEWAY_TOKEN matches the gateway token configured on Ubuntu (see /home/jeff/.openclaw/openclaw.json: gateway.auth.token / gateway.remote.token).');
              }
            }
          }
          console.log('[OpenClaw] ⚠️ SSH failed');
          reject(new Error('SSH command failed: ' + (stderr.split('\n')[0] || `exit code ${code}`)));
          return;
        }

        if (!stdout) {
          console.error('[OpenClaw] No output received from remote command');
          console.log('[OpenClaw] ⚠️ No output from SSH command');
          reject(new Error('SSH: No output received'));
          return;
        }

        try {
          console.log('[OpenClaw] Response received, parsing...');
          const parsed = parseJsonObject(stdout);

          if (!parsed) {
            console.error('[OpenClaw] Failed to parse JSON response');
            console.log('[OpenClaw] ⚠️ Parse error from SSH response');
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
          console.log('[OpenClaw] ⚠️ Parse exception from SSH response');
          reject(new Error('SSH: Parse error - ' + parseError.message));
        }
      });

      // Handle process errors
      sshProcess.on('error', (error) => {
        console.error('[OpenClaw] SSH spawn error:', error.message);
        console.log('[OpenClaw] ⚠️ SSH spawn error');
        reject(new Error('SSH spawn failed: ' + error.message));
      });

      // Send params JSON to stdin
      console.log('[OpenClaw] Sending params to stdin...');
      sshProcess.stdin.write(paramsJson);
      sshProcess.stdin.end();

    } catch (error) {
      console.error('[OpenClaw] Unexpected error:', error.message);
      console.log('[OpenClaw] ⚠️ Unexpected SSH setup error');
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
  console.log('[OpenClaw] HTTP timeout (ms):', OPENCLAW_JORDAN_HTTP_TIMEOUT_MS);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(gatewayUrl)) {
    console.warn('[OpenClaw] HTTP fallback is pointing at localhost. If you are not running an SSH tunnel or local gateway, this will return 0 leads.');
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
        timeout: OPENCLAW_JORDAN_HTTP_TIMEOUT_MS,
      }
    );

    // Async bridge mode: returns 202 { jobId, statusUrl }. Poll until complete.
    if (response.status === 202 && response.data?.statusUrl) {
      const statusUrl = response.data.statusUrl;
      const startedAt = Date.now();

      const resolveStatusUrl = (candidate) => {
        try {
          // If candidate is absolute URL, keep it.
          // If it is relative, resolve against gatewayUrl origin.
          return new URL(candidate, gatewayUrl).toString();
        } catch {
          return candidate;
        }
      };

      const pollUrl = resolveStatusUrl(statusUrl);
      console.log('[OpenClaw] HTTP bridge accepted job. Polling:', pollUrl);

      while (Date.now() - startedAt < OPENCLAW_JORDAN_HTTP_TIMEOUT_MS) {
        await new Promise((r) => setTimeout(r, OPENCLAW_JORDAN_HTTP_POLL_INTERVAL_MS));

        const statusResp = await axios.get(pollUrl, {
          headers: {
            ...(OPENCLAW_JORDAN_API_KEY ? { Authorization: `Bearer ${OPENCLAW_JORDAN_API_KEY}` } : {}),
            ...(OPENCLAW_JORDAN_GATEWAY_TOKEN ? { 'x-gateway-token': OPENCLAW_JORDAN_GATEWAY_TOKEN } : {}),
            ...(OPENCLAW_JORDAN_GATEWAY_TOKEN ? { 'x-openclaw-token': OPENCLAW_JORDAN_GATEWAY_TOKEN } : {}),
          },
          timeout: Math.min(15000, OPENCLAW_JORDAN_HTTP_TIMEOUT_MS),
        });

        const status = statusResp.data?.status;
        if (status === 'complete') {
          const leads = statusResp.data?.leads || [];
          console.log('[OpenClaw] HTTP bridge job complete. Leads:', Array.isArray(leads) ? leads.length : 0);
          return Array.isArray(leads)
            ? leads.map((lead) => normalizeOpenClawLead(lead, productInfo.location || '')).slice(0, MAX_LEADS)
            : [];
        }
        if (status === 'error') {
          console.error('[OpenClaw] HTTP bridge job failed:', statusResp.data?.error || 'Unknown error');
          return [];
        }
      }

      console.error('[OpenClaw] HTTP bridge polling timed out');
      return [];
    }

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
  if (!OPENCLAW_JORDAN_GATEWAY_BASE_URL && !OPENCLAW_JORDAN_REMOTE_GATEWAY_URL && !OPENCLAW_JORDAN_AGENT_URL) {
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

    // If SSH fails due to auth/token mismatch, HTTP fallback is very unlikely to help and
    // usually just results in localhost:0-leads noise. Surface the actionable error instead.
    if (/gateway token mismatch/i.test(sshError.message) || /unauthorized/i.test(sshError.message)) {
      console.error('[OpenClaw] Not attempting HTTP fallback due to unauthorized/token mismatch. Fix OPENCLAW_JORDAN_GATEWAY_TOKEN (must match Ubuntu gateway config) and retry.');
      return [];
    }

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

/**
 * Generate outreach message using OpenClaw via SSH
 */
async function generateMessageWithOpenClawCliViaSsh(productInfo, leadInfo) {
  return new Promise((resolve, reject) => {
    try {
      // Add debugging logs to verify the leadInfo object structure
      console.log('[OpenClaw] leadInfo object:', leadInfo);

      const params = {
        agentId: OPENCLAW_JORDAN_AGENT_ID || 'main',
        idempotencyKey: `jordan-message-${randomUUID()}`,
        message: JSON.stringify({
          task: 'Generate a persuasive, energetic outreach email for the following lead. Write in the style of Jordan Belfort from Wolf of Wall Street—confident, punchy, and high-energy—but with a Malaysian twist: friendly, respectful, a bit cheeky, and using local flavor. Use all the information provided about the product and the lead.\n\nFORMAT THE EMAIL AS FOLLOWS:\nDear [Company Name],\n\n[Body paragraph 1 - hook and relevance]\n[Body paragraph 2 - value proposition]\n[Body paragraph 3 - call to action]\n\nBest regards,\nVanta Tech Team\n\nIMPORTANT: \n- Start with "Dear [Company Name]," followed by a blank line\n- Use natural punctuation (commas, periods) instead of em-dashes\n- Write conversational and human-like, avoiding obvious AI markers\n- Keep it irresistible but not pushy',
          lead: {
            name: leadInfo.contactName || 'Valued Partner',
            company: leadInfo.companyName || 'your company',
            email: leadInfo.email || 'N/A',
            phone: leadInfo.phone || 'N/A',
            location: leadInfo.location || 'N/A',
            channel: leadInfo.channel || 'N/A',
          },
          product: {
            name: productInfo.productName || 'our product',
            description: productInfo.description || 'our services',
            targetCustomer: productInfo.targetCustomer || 'businesses like yours',
          },
          output: {
            instruction: 'Return ONLY the complete formatted email message as plain text. Proper line breaks after greeting. No JSON, no extra formatting, no markdown.',
          },
        }),
        timeout: Math.ceil(OPENCLAW_JORDAN_RPC_TIMEOUT_MS / 1000),
      };

      const paramsJson = JSON.stringify(params);

      // Use OPENCLAW_JORDAN_REMOTE_GATEWAY_URL for the remote SSH command
      const remoteGatewayUrl = OPENCLAW_JORDAN_REMOTE_GATEWAY_URL;
      if (!remoteGatewayUrl) {
        reject(new Error('[OpenClaw] No remote gateway URL configured'));
        return;
      }

      const tokenArg = OPENCLAW_JORDAN_GATEWAY_TOKEN
        ? ` --token '${shellEscapeSingleQuoted(OPENCLAW_JORDAN_GATEWAY_TOKEN)}'`
        : '';
      const remoteCommand =
        `PARAMS="$(cat)"; ` +
        `OPENCLAW_ALLOW_INSECURE_PRIVATE_WS=1 ` +
        `'${shellEscapeSingleQuoted(OPENCLAW_CLI_PATH)}' gateway call agent --json --expect-final ` +
        `--url '${shellEscapeSingleQuoted(remoteGatewayUrl)}' --params "$PARAMS"${tokenArg} --timeout ${OPENCLAW_JORDAN_RPC_TIMEOUT_MS}`;

      console.log('[OpenClaw] Spawning SSH process to generate message...');

      const sshProcess = spawn('ssh', [
        '-o', 'BatchMode=yes',
        OPENCLAW_SSH_TARGET,
        remoteCommand,
      ], {
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';
      let completed = false;

      // Set explicit timeout for SSH process
      const timeoutHandle = setTimeout(() => {
        if (!completed) {
          completed = true;
          console.error(`[OpenClaw] ⏱️ SSH timeout after ${OPENCLAW_JORDAN_RPC_TIMEOUT_MS}ms`);
          sshProcess.kill();
          reject(new Error(`SSH process timed out after ${OPENCLAW_JORDAN_RPC_TIMEOUT_MS}ms`));
        }
      }, OPENCLAW_JORDAN_RPC_TIMEOUT_MS);

      sshProcess.stdout.on('data', (data) => {
        stdout += data.toString();
        console.log('[OpenClaw] stdout received:', data.toString().slice(0, 100));
      });

      sshProcess.stderr.on('data', (data) => {
        const errorMsg = data.toString();
        stderr += errorMsg;
        console.log('[OpenClaw] stderr:', errorMsg.slice(0, 200));
      });

      sshProcess.on('close', (code) => {
        if (completed) return; // Already handled by timeout or other error
        completed = true;
        clearTimeout(timeoutHandle);

        if (code === 255 || code !== 0 || stderr.includes('Permission denied')) {
          if (code === 255 || stderr.includes('Permission denied')) {
            console.error('[OpenClaw] ❌ SSH key-based auth is required');
          } else {
            console.error('[OpenClaw] Remote command failed with exit code:', code);
            if (stderr) console.error('[OpenClaw] stderr:', stderr.slice(0, 500));
          }
          reject(new Error('SSH command failed'));
          return;
        }

        if (!stdout) {
          console.error('[OpenClaw] No output received from remote command');
          reject(new Error('SSH: No output received'));
          return;
        }

        try {
          console.log('[OpenClaw] Raw stdout:', stdout.slice(0, 300));
          console.log('[OpenClaw] Message generated, parsing response...');
          const parsed = parseJsonObject(stdout);
          
          console.log('[OpenClaw] Parsed type:', typeof parsed);
          console.log('[OpenClaw] Parsed value:', JSON.stringify(parsed).slice(0, 300));

          // Extract the message text from various possible response formats
          let message = '';
          
          if (typeof parsed === 'string') {
            // If it's already a string, use it directly
            message = parsed;
          } else if (parsed?.result?.payloads?.[0]?.text) {
            // OpenClaw standard format: result.payloads[0].text
            message = parsed.result.payloads[0].text;
          } else if (parsed?.result && typeof parsed.result === 'string') {
            // If it has a result field that's a string
            message = parsed.result;
          } else if (parsed?.message && typeof parsed.message === 'string') {
            // If it has a message field that's a string
            message = parsed.message;
          } else if (parsed?.data && typeof parsed.data === 'string') {
            // If it has a data field that's a string
            message = parsed.data;
          } else if (parsed?.output && typeof parsed.output === 'string') {
            // If it has an output field that's a string
            message = parsed.output;
          } else {
            // Last resort - stringify the object
            message = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
          }

          if (!message || message.length === 0) {
            console.error('[OpenClaw] No message text extracted from response');
            reject(new Error('SSH: Empty message response'));
            return;
          }

          console.log('[OpenClaw] ✓ Message extracted:', message.slice(0, 100));
          resolve(message);
        } catch (parseError) {
          console.error('[OpenClaw] Error parsing message response:', parseError.message);
          reject(new Error('SSH: Parse error'));
        }
      });

      sshProcess.on('error', (error) => {
        if (completed) return;
        completed = true;
        clearTimeout(timeoutHandle);
        console.error('[OpenClaw] SSH spawn error:', error.message);
        reject(new Error('SSH spawn failed: ' + error.message));
      });

      console.log(`[OpenClaw] Sending params to stdin (timeout: ${OPENCLAW_JORDAN_RPC_TIMEOUT_MS}ms)...`);
      sshProcess.stdin.write(paramsJson);
      sshProcess.stdin.end();
      console.log('[OpenClaw] Params written to stdin, waiting for response...');

    } catch (error) {
      console.error('[OpenClaw] Unexpected error:', error.message);
      reject(new Error('SSH setup failed: ' + error.message));
    }
  });
}

/**
 * Generate outreach message using OpenClaw (SSH primary, HTTP fallback)
 */
async function generateMessageWithOpenClaw(productInfo, leadInfo) {
  // Try SSH first
  try {
    console.log('[OpenClaw] Attempting SSH transport for message generation...');
    return await generateMessageWithOpenClawCliViaSsh(productInfo, leadInfo);
  } catch (sshError) {
    console.warn(`[OpenClaw] SSH message generation failed: ${sshError.message}`);
    console.log('[OpenClaw] ⚠️ SSH failed, cannot generate message - would fallback to HTTP but localhost not available');
    throw new Error('Message generation failed: ' + sshError.message);
  }
}

module.exports = {
  findLeadsWithOpenClaw,
  generateMessageWithOpenClaw,
};

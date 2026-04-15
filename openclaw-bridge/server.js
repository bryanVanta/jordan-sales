const express = require('express');
const { randomUUID } = require('crypto');
const { spawn } = require('child_process');

const PORT = Number(process.env.PORT || 31000);
const DOCKER_CONTAINER = (process.env.OPENCLAW_DOCKER_CONTAINER || 'openclaw-sales-bot').trim();
const OPENCLAW_GATEWAY_WS_URL = (process.env.OPENCLAW_GATEWAY_WS_URL || 'ws://127.0.0.1:30080').trim();
const OPENCLAW_AGENT_ID = (process.env.OPENCLAW_AGENT_ID || 'main').trim();
const OPENCLAW_TIMEOUT_MS = Number(process.env.OPENCLAW_TIMEOUT_MS || 300000);
const OPENCLAW_BRIDGE_DEBUG = String(process.env.OPENCLAW_BRIDGE_DEBUG || '').trim() === '1';
const MAX_LEADS = Number(process.env.OPENCLAW_MAX_LEADS || 100);
const OPENCLAW_BRIDGE_ASYNC_DEFAULT = String(process.env.OPENCLAW_BRIDGE_ASYNC || '1').trim() !== '0';
const OPENCLAW_BRIDGE_JOB_TTL_MS = Number(process.env.OPENCLAW_BRIDGE_JOB_TTL_MS || 30 * 60 * 1000);

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

const extractLeadsFromOpenClawResponse = (parsed, stdout = '') => {
  const direct = extractLeadsFromPayload(parsed?.result || parsed);
  if (Array.isArray(direct) && direct.length > 0) return direct;

  // Common OpenClaw CLI format: result.payloads[0].text contains JSON (or JSON fenced) as a string.
  const payloadText =
    parsed?.result?.payloads?.[0]?.text ||
    parsed?.payloads?.[0]?.text ||
    parsed?.result?.payloads?.[0]?.content ||
    parsed?.payloads?.[0]?.content ||
    '';

  if (payloadText) {
    const inner = parseJsonObject(payloadText);
    const innerLeads = extractLeadsFromPayload(inner?.result || inner);
    if (Array.isArray(innerLeads) && innerLeads.length > 0) return innerLeads;
  }

  // Last resort: sometimes the stdout itself includes the JSON object we want.
  const fromStdout = parseJsonObject(stdout);
  const stdoutLeads = extractLeadsFromPayload(fromStdout?.result || fromStdout);
  if (Array.isArray(stdoutLeads) && stdoutLeads.length > 0) return stdoutLeads;

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
  return JSON.stringify({
    task: `Find up to ${MAX_LEADS} leads that match this product and target customer profile. Return diverse results from different companies, locations, and regions.`,
    searchStrategy: {
      diversification:
        'CRITICAL: If you find the initial set of companies/locations exhausted, expand to other regions. For Malaysia: search beyond Kuala Lumpur (Selangor, Penang, Johor, Sabah, Sarawak). For hospitality: search resorts, guesthouses, vacation rentals, boutique accommodations. For retail: search different districts and shopping centers. For corporate: search different industries and company sizes.',
      geographicExpansion:
        'If searching Malaysia, expand to: Selangor, Subang Jaya, Petaling Jaya, Shah Alam, Kuching, George Town, Johor Bahru, Kota Kinabalu, Ipoh, Melaka beyond the primary location.',
      minLeads: Math.min(50, MAX_LEADS),
      targetLeads: MAX_LEADS,
    },
    exclusions:
      Array.isArray(previousCompanies) && previousCompanies.length > 0
        ? {
            previouslyFoundCompanies: previousCompanies,
            instruction: `CRITICAL - DO NOT RETURN ANY OF THESE COMPANIES: ${previousCompanies.join(
              ', '
            )}. Find completely different companies, locations, and regions. These have already been contacted. Search aggressively in new areas, different business types if applicable, and alternate locations.`,
          }
        : {
            previouslyFoundCompanies: [],
            instruction: 'No exclusions - search broadly for diverse leads across multiple locations and business types.',
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
    productInfo,
  });
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

const jobs = new Map();

const cleanupJobs = () => {
  const now = Date.now();
  for (const [jobId, job] of jobs.entries()) {
    if (!job?.createdAt) continue;
    if (now - job.createdAt > OPENCLAW_BRIDGE_JOB_TTL_MS) jobs.delete(jobId);
  }
};

setInterval(cleanupJobs, Math.min(OPENCLAW_BRIDGE_JOB_TTL_MS, 5 * 60 * 1000)).unref?.();

app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

const runLeadJob = async (jobId) => {
  const job = jobs.get(jobId);
  if (!job) return;

  job.status = 'running';
  job.startedAt = Date.now();

  try {
    const message = buildJordanPrompt(job.productInfo, job.previousCompanies);
    const { stdout } = await callOpenClawViaDocker({
      agentId: job.agentId,
      message,
      token: job.token,
      timeoutMs: OPENCLAW_TIMEOUT_MS,
    });

    const parsed = parseJsonObject(stdout);
    const rawLeads = extractLeadsFromOpenClawResponse(parsed, stdout);
    const leads = Array.isArray(rawLeads)
      ? rawLeads.map((l) => normalizeLead(l, job.productInfo?.location || '')).filter((l) => l.companyName || l.website)
      : [];

    job.status = 'complete';
    job.finishedAt = Date.now();
    job.leads = leads;

    if (job.debugRequested) {
      job.debug = {
        stdoutPreview: String(stdout || '').slice(0, 2000),
        parsedType: parsed === null ? 'null' : Array.isArray(parsed) ? 'array' : typeof parsed,
        parsedKeys: parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed).slice(0, 50) : [],
      };
      if (leads.length === 0) {
        // eslint-disable-next-line no-console
        console.log('[openclaw-bridge] 0 leads; stdout preview:', job.debug.stdoutPreview);
      }
    }
  } catch (err) {
    job.status = 'error';
    job.finishedAt = Date.now();
    job.error = String(err?.message || err);
  }
};

// Compatibility endpoint: matches the backend's legacy HTTP transport.
// Default behavior is async to avoid Cloudflare 524 timeouts for long-running lead searches.
// Use ?sync=1 to force synchronous behavior.
app.post('/jordan/find-leads', async (req, res) => {
  const body = req.body || {};
  const productInfo = body.productInfo || {};
  const previousCompanies = body.previousCompanies || [];
  const context = body.context || {};

  const agentId = (context.agentId || OPENCLAW_AGENT_ID || 'main').toString();
  const token = getTokenFromRequest(req);
  const debugRequested = OPENCLAW_BRIDGE_DEBUG || String(req.query?.debug || '') === '1';
  const syncRequested = String(req.query?.sync || '') === '1';

  if (!syncRequested && OPENCLAW_BRIDGE_ASYNC_DEFAULT) {
    const jobId = randomUUID();
    jobs.set(jobId, {
      id: jobId,
      status: 'queued',
      createdAt: Date.now(),
      agentId,
      token,
      productInfo,
      previousCompanies,
      debugRequested,
    });

    setImmediate(() => runLeadJob(jobId));

    res.status(202).json({
      jobId,
      statusUrl: `/jordan/find-leads/${jobId}`,
    });
    return;
  }

  // Synchronous mode (best for local testing; can hit Cloudflare 524 in production).
  const startMs = Date.now();
  try {
    const message = buildJordanPrompt(productInfo, previousCompanies);
    const { stdout } = await callOpenClawViaDocker({
      agentId,
      message,
      token,
      timeoutMs: OPENCLAW_TIMEOUT_MS,
    });

    const parsed = parseJsonObject(stdout);
    const rawLeads = extractLeadsFromOpenClawResponse(parsed, stdout);
    const leads = Array.isArray(rawLeads)
      ? rawLeads.map((l) => normalizeLead(l, productInfo.location || '')).filter((l) => l.companyName || l.website)
      : [];

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

app.get('/jordan/find-leads/:jobId', (req, res) => {
  const jobId = String(req.params.jobId || '').trim();
  const job = jobs.get(jobId);
  if (!job) {
    res.status(404).json({ error: 'Not Found' });
    return;
  }

  const base = {
    jobId,
    status: job.status,
    createdAt: job.createdAt,
    startedAt: job.startedAt || null,
    finishedAt: job.finishedAt || null,
    tookMs: job.finishedAt && job.startedAt ? job.finishedAt - job.startedAt : null,
  };

  if (job.status === 'complete') {
    res.status(200).json({ ...base, leads: job.leads || [], ...(job.debug ? { debug: job.debug } : {}) });
    return;
  }

  if (job.status === 'error') {
    res.status(200).json({ ...base, error: job.error || 'Unknown error', ...(job.debug ? { debug: job.debug } : {}) });
    return;
  }

  res.status(200).json(base);
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[openclaw-bridge] listening on http://0.0.0.0:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[openclaw-bridge] docker container: ${DOCKER_CONTAINER}`);
  // eslint-disable-next-line no-console
  console.log(`[openclaw-bridge] gateway ws url: ${OPENCLAW_GATEWAY_WS_URL}`);
});

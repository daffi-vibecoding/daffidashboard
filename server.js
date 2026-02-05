const http = require('http');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const readline = require('readline');
const { URL } = require('url');

const PORT = process.env.PORT || 5177;
const ROOT = __dirname;
const DATA_DIR = path.join(ROOT, 'data');
const KANBAN_FILE = path.join(DATA_DIR, 'kanban.json');
const PRICING_FILE = path.join(DATA_DIR, 'pricing.json');
const LOG_DIR = process.env.OPENCLAW_LOG_DIR || path.join(os.homedir(), '.openclaw', 'logs');

const DEFAULT_KANBAN = {
  columns: [
    { id: 'backlog', title: 'Backlog', cards: [] },
    { id: 'in_progress', title: 'In Progress', cards: [] },
    { id: 'done', title: 'Done', cards: [] },
    { id: 'blocked', title: 'Blocked', cards: [] },
  ],
};

const DEFAULT_PRICING = {
  providers: {
    Anthropic: { input_per_million: 0, output_per_million: 0, cache_per_million: 0 },
    OpenAI: { input_per_million: 0, output_per_million: 0, cache_per_million: 0 },
    Google: { input_per_million: 0, output_per_million: 0, cache_per_million: 0 },
  },
};

let usageCache = {
  signature: null,
  data: null,
  updatedAt: 0,
};

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function sendText(res, status, body, contentType = 'text/plain') {
  res.writeHead(status, { 'Content-Type': contentType });
  res.end(body);
}

function safePath(requestPath) {
  const resolved = path.normalize(path.join(ROOT, requestPath));
  if (!resolved.startsWith(ROOT)) return null;
  return resolved;
}

async function ensureKanban() {
  try {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    await fsp.access(KANBAN_FILE, fs.constants.F_OK);
  } catch (err) {
    await fsp.writeFile(KANBAN_FILE, JSON.stringify(DEFAULT_KANBAN, null, 2));
  }
}

async function loadPricing() {
  try {
    const raw = await fsp.readFile(PRICING_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return DEFAULT_PRICING;
  }
}

async function loadKanban() {
  await ensureKanban();
  const raw = await fsp.readFile(KANBAN_FILE, 'utf8');
  return JSON.parse(raw);
}

async function saveKanban(data) {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const tempFile = `${KANBAN_FILE}.tmp`;
  await fsp.writeFile(tempFile, JSON.stringify(data, null, 2));
  await fsp.rename(tempFile, KANBAN_FILE);
}

function extractTimestamp(line, obj) {
  if (obj) {
    if (obj.time) return obj.time;
    if (obj._meta?.date) return obj._meta.date;
  }
  const match = line.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/);
  return match ? match[0] : null;
}

function extractProvider(obj, line) {
  const candidate = obj?.provider || obj?.vendor || obj?.apiProvider || obj?.modelProvider;
  const model = obj?.model || obj?.modelName || obj?.engine;
  const text = `${candidate || ''} ${model || ''} ${line || ''}`.toLowerCase();

  if (text.includes('anthropic') || text.includes('claude')) return 'Anthropic';
  if (text.includes('openai') || text.includes('gpt') || text.includes('o1')) return 'OpenAI';
  if (text.includes('google') || text.includes('gemini')) return 'Google';
  return 'Unknown';
}

function extractUser(obj, line) {
  const candidate = obj?.user || obj?.username || obj?.owner || obj?.profile || obj?.author || obj?.actor;
  const text = `${candidate || ''} ${line || ''}`.toLowerCase();
  if (text.includes('don')) return 'Don';
  if (text.includes('amanda')) return 'Amanda';
  return 'Unknown';
}

function extractTokensFromObject(obj, tokens) {
  if (!obj) return;
  if (Array.isArray(obj)) {
    obj.forEach((item) => extractTokensFromObject(item, tokens));
    return;
  }
  if (typeof obj !== 'object') return;

  Object.entries(obj).forEach(([key, value]) => {
    const normalized = key.toLowerCase();
    if (typeof value === 'number') {
      if (normalized.includes('token')) {
        if (normalized.includes('prompt') || normalized.includes('input')) tokens.input += value;
        else if (normalized.includes('completion') || normalized.includes('output')) tokens.output += value;
        else if (normalized.includes('cache')) tokens.cache += value;
      }
    }
    if (typeof value === 'object') extractTokensFromObject(value, tokens);
  });
}

function extractTokensFromText(line, tokens) {
  const patterns = [
    { type: 'input', regex: /(prompt|input)[_ ]?tokens\s*[:=]\s*(\d+)/gi },
    { type: 'output', regex: /(completion|output)[_ ]?tokens\s*[:=]\s*(\d+)/gi },
    { type: 'cache', regex: /cache[_ ]?tokens\s*[:=]\s*(\d+)/gi },
  ];

  patterns.forEach(({ type, regex }) => {
    let match;
    while ((match = regex.exec(line))) {
      tokens[type] += Number(match[2] || 0);
    }
  });
}

function extractCostFromObject(obj) {
  if (!obj || typeof obj !== 'object') return 0;
  let cost = 0;
  Object.entries(obj).forEach(([key, value]) => {
    const normalized = key.toLowerCase();
    if (typeof value === 'number' && (normalized.includes('cost') || normalized.includes('price') || normalized.includes('usd') || normalized.includes('spend'))) {
      cost += value;
    }
    if (typeof value === 'string' && (normalized.includes('cost') || normalized.includes('price') || normalized.includes('usd') || normalized.includes('spend'))) {
      const parsed = Number(value.replace(/[^0-9.]/g, ''));
      if (Number.isFinite(parsed)) cost += parsed;
    }
    if (typeof value === 'object') cost += extractCostFromObject(value);
  });
  return cost;
}

function extractCostFromText(line) {
  let cost = 0;
  const costMatch = line.match(/cost\s*[:=]\s*\$?([0-9]+(?:\.[0-9]+)?)/i);
  if (costMatch) cost += Number(costMatch[1]);
  const dollarMatch = line.match(/\$([0-9]+(?:\.[0-9]+)?)/);
  if (dollarMatch) cost += Number(dollarMatch[1]);
  return cost;
}

function estimateCost(provider, tokens, pricing) {
  const rates = pricing.providers?.[provider];
  if (!rates) return 0;
  const input = (tokens.input / 1_000_000) * (rates.input_per_million || 0);
  const output = (tokens.output / 1_000_000) * (rates.output_per_million || 0);
  const cache = (tokens.cache / 1_000_000) * (rates.cache_per_million || 0);
  return input + output + cache;
}

function buildSeries(buckets) {
  return Object.entries(buckets).map(([label, value]) => ({ label, value }));
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function weekKey(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 1 - dayNum);
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - new Date(Date.UTC(d.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7)).padStart(2, '0')}`;
}

function monthKey(date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function parseLogFile(filePath, events, warnings) {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line || line.length < 4) continue;

    let obj = null;
    if (line.trim().startsWith('{')) {
      try {
        obj = JSON.parse(line);
      } catch (err) {
        obj = null;
      }
    }

    const text = obj
      ? Object.values(obj)
          .filter((value) => typeof value === 'string')
          .join(' ')
      : line;

    const tokens = { input: 0, output: 0, cache: 0 };
    if (obj) extractTokensFromObject(obj, tokens);
    extractTokensFromText(text, tokens);

    const cost = (obj ? extractCostFromObject(obj) : 0) + extractCostFromText(text);

    if (tokens.input + tokens.output + tokens.cache === 0 && cost === 0) {
      continue;
    }

    const timestamp = extractTimestamp(line, obj);
    const provider = extractProvider(obj, text);
    const user = extractUser(obj, text);

    events.push({
      timestamp,
      provider,
      user,
      tokens,
      cost,
      source: path.basename(filePath),
    });
  }

  stream.on('error', (err) => warnings.push(`Failed to read ${filePath}: ${err.message}`));
}

async function parseLogs(logFiles) {
  const warnings = [];
  if (!logFiles.length) warnings.push('No .log files found in OpenClaw log directory.');

  const events = [];
  for (const filePath of logFiles) {
    await parseLogFile(filePath, events, warnings);
  }

  if (!events.length) warnings.push('No usage events detected. Enable usage logging or verify log format.');

  return { events, warnings, sourceFiles: logFiles.map((file) => path.basename(file)) };
}

async function getUsageData() {
  const pricing = await loadPricing();
  let files = [];
  try {
    files = await fsp.readdir(LOG_DIR);
  } catch (err) {
    return {
      logDir: LOG_DIR,
      sourceFiles: [],
      lastUpdated: new Date().toISOString(),
      warnings: [`Log directory not found: ${LOG_DIR}`],
      summary: { totalCost: 0, totalRequests: 0, tokens: { input: 0, output: 0, cache: 0 } },
      providers: { Anthropic: 0, OpenAI: 0, Google: 0, Unknown: 0 },
      users: { Don: 0, Amanda: 0, Unknown: 0 },
      tokenBreakdown: { 'Input Tokens': 0, 'Output Tokens': 0, 'Cache Tokens': 0, 'Total Tokens': 0 },
      realtime: { windowMinutes: 5, requests: 0, cost: 0, tokens: { input: 0, output: 0, cache: 0 } },
      timeseries: { daily: [], weekly: [], monthly: [] },
    };
  }
  const logFiles = files.filter((name) => name.endsWith('.log')).map((name) => path.join(LOG_DIR, name));
  const stats = await Promise.all(
    logFiles.map(async (file) => {
      const stat = await fsp.stat(file);
      return `${path.basename(file)}:${stat.mtimeMs}:${stat.size}`;
    })
  );
  const signature = JSON.stringify(stats);

  if (usageCache.signature === signature && usageCache.data) {
    return usageCache.data;
  }

  const { events, warnings, sourceFiles } = await parseLogs(logFiles);

  const providers = { Anthropic: 0, OpenAI: 0, Google: 0, Unknown: 0 };
  const users = { Don: 0, Amanda: 0, Unknown: 0 };
  const tokensTotal = { input: 0, output: 0, cache: 0 };

  const dailyBuckets = {};
  const weeklyBuckets = {};
  const monthlyBuckets = {};
  const now = Date.now();
  const realtimeWindow = 5 * 60 * 1000;
  const realtime = { windowMinutes: 5, requests: 0, cost: 0, tokens: { input: 0, output: 0, cache: 0 } };

  let totalCost = 0;
  let totalRequests = 0;

  events.forEach((event) => {
    const timestamp = event.timestamp ? Date.parse(event.timestamp) : null;
    const eventTokens = event.tokens || { input: 0, output: 0, cache: 0 };
    const cost = event.cost > 0 ? event.cost : estimateCost(event.provider, eventTokens, pricing);

    providers[event.provider] = (providers[event.provider] || 0) + cost;
    users[event.user] = (users[event.user] || 0) + cost;

    tokensTotal.input += eventTokens.input;
    tokensTotal.output += eventTokens.output;
    tokensTotal.cache += eventTokens.cache;

    totalCost += cost;
    totalRequests += 1;

    if (timestamp) {
      const date = new Date(timestamp);
      const dayKey = isoDate(date);
      const week = weekKey(date);
      const month = monthKey(date);
      dailyBuckets[dayKey] = (dailyBuckets[dayKey] || 0) + cost;
      weeklyBuckets[week] = (weeklyBuckets[week] || 0) + cost;
      monthlyBuckets[month] = (monthlyBuckets[month] || 0) + cost;

      if (now - timestamp <= realtimeWindow) {
        realtime.requests += 1;
        realtime.cost += cost;
        realtime.tokens.input += eventTokens.input;
        realtime.tokens.output += eventTokens.output;
        realtime.tokens.cache += eventTokens.cache;
      }
    }
  });

  const dailySeries = buildSeries(dailyBuckets).sort((a, b) => a.label.localeCompare(b.label));
  const weeklySeries = buildSeries(weeklyBuckets).sort((a, b) => a.label.localeCompare(b.label));
  const monthlySeries = buildSeries(monthlyBuckets).sort((a, b) => a.label.localeCompare(b.label));

  const data = {
    logDir: LOG_DIR,
    sourceFiles,
    lastUpdated: new Date().toISOString(),
    warnings,
    summary: {
      totalCost,
      totalRequests,
      tokens: tokensTotal,
    },
    providers,
    users,
    tokenBreakdown: {
      'Input Tokens': tokensTotal.input,
      'Output Tokens': tokensTotal.output,
      'Cache Tokens': tokensTotal.cache,
      'Total Tokens': tokensTotal.input + tokensTotal.output + tokensTotal.cache,
    },
    realtime,
    timeseries: {
      daily: dailySeries,
      weekly: weeklySeries,
      monthly: monthlySeries,
    },
  };

  usageCache = { signature, data, updatedAt: Date.now() };
  return data;
}

async function handleApi(req, res, url) {
  if (url.pathname === '/api/kanban' && req.method === 'GET') {
    const data = await loadKanban();
    return sendJson(res, 200, data);
  }

  if (url.pathname === '/api/kanban' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 500_000) req.destroy();
    });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body || '{}');
        if (!Array.isArray(data.columns)) throw new Error('Invalid kanban payload');
        await saveKanban(data);
        sendJson(res, 200, { ok: true });
      } catch (err) {
        sendJson(res, 400, { error: err.message });
      }
    });
    return;
  }

  if (url.pathname === '/api/usage' && req.method === 'GET') {
    try {
      const data = await getUsageData();
      return sendJson(res, 200, data);
    } catch (err) {
      return sendJson(res, 500, { error: err.message });
    }
  }

  sendJson(res, 404, { error: 'Not found' });
}

function serveStatic(req, res, url) {
  let requestPath = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = safePath(requestPath);
  if (!filePath) return sendText(res, 403, 'Forbidden');

  fs.readFile(filePath, (err, data) => {
    if (err) return sendText(res, 404, 'Not found');
    const ext = path.extname(filePath);
    const contentType =
      ext === '.html'
        ? 'text/html'
        : ext === '.css'
        ? 'text/css'
        : ext === '.js'
        ? 'application/javascript'
        : 'text/plain';
    sendText(res, 200, data, contentType);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');

  if (url.pathname.startsWith('/api/')) {
    return handleApi(req, res, url);
  }

  return serveStatic(req, res, url);
});

server.listen(PORT, () => {
  console.log(`OpenClaw dashboard running on http://localhost:${PORT}`);
});

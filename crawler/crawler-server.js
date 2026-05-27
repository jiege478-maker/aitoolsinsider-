/**
 * Crawler WebSocket Server
 *
 * Provides a WebSocket + HTTP API for the admin panel to:
 *   - Start/stop the crawler remotely
 *   - Stream real-time logs to the browser
 *   - Check crawler status
 *
 * Usage:
 *   node crawler-server.js
 *   CRAWLER_PORT=3456 node crawler-server.js
 */

const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

// ============================================================
// CONFIGURATION
// ============================================================

const PORT = process.env.CRAWLER_PORT || 3456;
const CRAWLER_SCRIPT = path.join(__dirname, 'crawler.js');
const CRAWLER_DIR = __dirname;
const MAX_LOG_LINES = 2000;

// ============================================================
// STATE
// ============================================================

let crawlerProcess = null;
let isRunning = false;
let logHistory = [];
let clients = new Set();
let startTime = null;
let lastRunInfo = null;

// Stats tracking (parsed from crawler output)
let crawlStats = {
  processed: 0,
  uploaded: 0,
  skipped: 0,
  errors: 0,
  currentPhase: 'idle',
  currentArticle: '',
  progress: 0,
};

// ============================================================
// LOG BROADCAST
// ============================================================

function addLog(line) {
  const entry = {
    timestamp: new Date().toISOString(),
    text: line,
    type: line.includes('[ERR]') || line.includes('Error') || line.includes('Fatal')
      ? 'error'
      : line.includes('[OK]') || line.includes('Uploaded')
        ? 'success'
        : line.includes('[SKIP]')
          ? 'skip'
          : line.includes('[SEO]') || line.includes('Summary')
            ? 'info'
            : 'log',
  };
  logHistory.push(entry);
  if (logHistory.length > MAX_LOG_LINES) {
    logHistory = logHistory.slice(-MAX_LOG_LINES);
  }
  broadcast({ type: 'log', data: entry });
}

function broadcast(msg) {
  const data = JSON.stringify(msg);
  for (const ws of clients) {
    try {
      if (ws.readyState === 1) ws.send(data);
    } catch (e) { /* ignore */ }
  }
}

function broadcastStatus() {
  broadcast({
    type: 'status',
    data: {
      running: isRunning,
      startTime,
      stats: crawlStats,
      lastRun: lastRunInfo,
    },
  });
}

// ============================================================
// PARSE CRAWLER OUTPUT
// ============================================================

function parseCrawlerLine(line) {
  // Update stats from crawler output
  const summaryMatch = line.match(/(Processed|Uploaded|Skipped|Errors):\s*(\d+)/);
  if (summaryMatch) {
    const key = summaryMatch[1].toLowerCase();
    crawlStats[key] = parseInt(summaryMatch[2], 10);
  }

  // Track current article being processed
  const scrapingMatch = line.match(/^\[\s*(\d+)\/(\d+)\]\s+(.+)/);
  if (scrapingMatch) {
    crawlStats.currentArticle = scrapingMatch[3].trim().substring(0, 80);
    crawlStats.progress = Math.round((parseInt(scrapingMatch[1], 10) / parseInt(scrapingMatch[2], 10)) * 100);
  }

  // Track phase
  if (line.includes('--- Scraping')) {
    crawlStats.currentPhase = 'scraping';
  } else if (line.includes('--- Post-processing')) {
    crawlStats.currentPhase = 'processing';
  } else if (line.includes('--- Upload Queue')) {
    crawlStats.currentPhase = 'uploading';
  } else if (line.includes('--- GitHub')) {
    crawlStats.currentPhase = 'github';
  } else if (line.includes('Summary')) {
    crawlStats.currentPhase = 'done';
  } else if (line.includes('Fatal error')) {
    crawlStats.currentPhase = 'error';
  }
}

// ============================================================
// CRAWLER CONTROL
// ============================================================

async function startCrawler(options = {}) {
  if (isRunning) {
    throw new Error('Crawler is already running');
  }

  // Reset stats
  crawlStats = {
    processed: 0,
    uploaded: 0,
    skipped: 0,
    errors: 0,
    currentPhase: 'starting',
    currentArticle: '',
    progress: 0,
  };
  logHistory = [];
  isRunning = true;
  startTime = new Date().toISOString();

  // Build crawler env
  const env = {
    ...process.env,
    LIMIT: String(options.limit || 20),
    CONCURRENCY: String(options.concurrency || 10),
    HOT_TERMS_ONLY: options.hotTermsOnly ? 'true' : 'false',
    DRY_RUN: options.dryRun ? 'true' : 'false',
  };
  if (options.source) env.SOURCE = options.source;

  addLog(`🚀 Starting crawler (limit=${options.limit || 20}, concurrency=${options.concurrency || 10}, hotTermsOnly=${!!options.hotTermsOnly})`);
  addLog(`   CWD: ${CRAWLER_DIR}`);
  broadcastStatus();

  crawlerProcess = spawn('node', [CRAWLER_SCRIPT], {
    cwd: CRAWLER_DIR,
    env,
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  // Capture stdout
  crawlerProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      addLog(line);
      parseCrawlerLine(line);
    }
    broadcastStatus();
  });

  // Capture stderr
  crawlerProcess.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      addLog(`[STDERR] ${line}`);
    }
  });

  // Handle exit
  crawlerProcess.on('close', (code) => {
    addLog(`\n--- Crawler finished (exit code: ${code}) ---`);
    addLog(`Processed: ${crawlStats.processed} | Uploaded: ${crawlStats.uploaded} | Skipped: ${crawlStats.skipped} | Errors: ${crawlStats.errors}`);

    lastRunInfo = {
      finishedAt: new Date().toISOString(),
      startedAt: startTime,
      exitCode: code,
      stats: { ...crawlStats },
    };

    // Save to file for persistence
    try {
      fs.writeFileSync(path.join(CRAWLER_DIR, 'last-run.json'), JSON.stringify(lastRunInfo, null, 2));
    } catch (e) { /* ignore */ }

    isRunning = false;
    crawlerProcess = null;
    crawlStats.currentPhase = code === 0 ? 'completed' : 'failed';
    broadcastStatus();
  });

  // Handle error
  crawlerProcess.on('error', (err) => {
    addLog(`[ERR] Failed to start crawler: ${err.message}`);
    isRunning = false;
    crawlerProcess = null;
    crawlStats.currentPhase = 'error';
    broadcastStatus();
  });
}

function stopCrawler() {
  if (!crawlerProcess || !isRunning) {
    throw new Error('Crawler is not running');
  }
  addLog('\n--- Stopping crawler (user request) ---');
  crawlerProcess.kill('SIGTERM');

  // Force kill after 5s if still alive
  setTimeout(() => {
    if (crawlerProcess && isRunning) {
      addLog('[WARN] Force killing crawler process');
      crawlerProcess.kill('SIGKILL');
    }
  }, 5000);
}

// ============================================================
// LIVE HOT TERMS (multi-source, China-friendly)
// ============================================================

const AI_KEYWORDS = ['ai', 'artificial intelligence', 'machine learning', 'deep learning', 'llm', 'gpt', 'chatgpt', 'claude', 'gemini', 'copilot', 'agent', 'neural', 'openai', 'anthropic', 'llama', 'mistral', 'diffusion', 'transformer', 'rag', 'embedding', 'vector', 'langchain', 'pytorch', 'tensorflow', 'generative', 'multimodal'];

function isAiRelated(term) {
  const lower = (term || '').toLowerCase();
  for (const kw of AI_KEYWORDS) {
    if (lower.includes(kw)) return true;
  }
  return false;
}

async function fetchGithubTrending() {
  const results = [];
  try {
    const res = await fetch('https://api.github.com/search/repositories?q=ai+llm+agent+tutorial&sort=stars&order=desc&per_page=15', {
      headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'AI-Tools-Crawler/1.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      for (const repo of (data.items || [])) {
        const term = repo.name + ': ' + (repo.description || '').substring(0, 60);
        const stars = repo.stargazers_count || 0;
        results.push({ term: term.substring(0, 80), source: 'GitHub', weight: Math.min(30, Math.round(stars / 100)) });
      }
    }
  } catch (e) {
    console.log(`  [HotTerms] GitHub error: ${e.message}`);
  }

  // Also scrape github.com/trending for weekly AI topics
  try {
    const res2 = await fetch('https://github.com/trending?since=weekly', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (res2.ok) {
      const html = await res2.text();
      const repoMatches = html.match(/<h2[^>]*>[\s\S]*?<a[^>]*href="\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi);
      if (repoMatches) {
        for (const match of repoMatches.slice(0, 20)) {
          const nameMatch = match.match(/href="\/([^"]+)"/);
          if (nameMatch) {
            const name = nameMatch[1].replace('/', ' / ');
            results.push({ term: name + ' (trending)', source: 'GitHub Trending', weight: 15 });
          }
        }
      }
    }
  } catch (e) { /* ignore */ }

  return results;
}

async function fetchHuggingFacePapers() {
  const results = [];
  try {
    const res = await fetch('https://huggingface.co/api/daily_papers', {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const papers = await res.json();
      for (const paper of (papers || []).slice(0, 20)) {
        const title = paper.title?.substring(0, 100) || '';
        // Extract key terms from paper title
        const terms = title.match(/\b(AI|LLM|GPT|ChatGPT|Claude|Gemini|Agent|Diffusion|Transformer|RAG|Multimodal|Neural|Deep|Learning|Language|Model|Vision|Speech|Video|Image|Generation|Reasoning|Fine[-\s]?Tuning|Alignment|RLHF|DPO|LoRA|Quantization|MoE|Attention)\b/gi);
        if (terms && terms.length > 0) {
          // Use the paper title itself as a hot term if it's AI-related
          if (isAiRelated(title)) {
            results.push({ term: title.substring(0, 80), source: 'HuggingFace', weight: 12 });
          }
          // Also add individual key terms
          const unique = [...new Set(terms.map(t => t.toLowerCase()))];
          unique.slice(0, 3).forEach(t => {
            results.push({ term: t, source: 'HuggingFace Papers', weight: 8 });
          });
        }
      }
    }
  } catch (e) {
    console.log(`  [HotTerms] HuggingFace error: ${e.message}`);
  }
  return results;
}

async function fetchBaiduSuggestions() {
  const results = [];
  const seeds = ['AI', '人工智能', 'ChatGPT', 'Claude', 'Gemini', 'DeepSeek', 'AI工具', '大模型', 'AI编程', 'AI写作'];
  try {
    for (const seed of seeds) {
      const url = `https://suggestion.baidu.com/s?wd=${encodeURIComponent(seed)}&cb=callback&rn=5`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const text = await res.text();
        const jsonMatch = text.match(/callback\(([\s\S]*?)\)/);
        if (jsonMatch) {
          const data = JSON.parse(jsonMatch[1]);
          const suggestions = data.g || data.s || [];
          suggestions.forEach((s, idx) => {
            if (s) {
              results.push({ term: s, source: '百度搜索', weight: Math.max(5, 15 - idx * 2) });
            }
          });
        }
      }
    }
  } catch (e) {
    console.log(`  [HotTerms] Baidu error: ${e.message}`);
  }
  return results;
}

async function fetch36Kr() {
  const results = [];
  try {
    const res = await fetch('https://36kr.com/api/search/entity-search?page=1&per_page=20&keyword=AI&type=articles&sort=date', {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/json' },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data?.items || [];
      for (const item of items.slice(0, 15)) {
        const title = item.title || '';
        if (title && isAiRelated(title)) {
          results.push({ term: title.substring(0, 60), source: '36氪', weight: 8 });
        }
      }
    }
  } catch (e) {
    console.log(`  [HotTerms] 36Kr error: ${e.message}`);
  }
  return results;
}

async function fetchZhihu() {
  const results = [];
  try {
    const res = await fetch('https://www.zhihu.com/api/v3/feed/topstory/hot-lists/total?limit=20', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const data = await res.json();
      const items = data?.data || [];
      for (const item of items.slice(0, 20)) {
        const title = item?.target?.title || '';
        if (title && isAiRelated(title)) {
          results.push({ term: title.substring(0, 60), source: '知乎', weight: 10 });
        }
      }
    }
  } catch (e) {
    console.log(`  [HotTerms] Zhihu error: ${e.message}`);
  }
  return results;
}

let liveHotTermsCache = { terms: [], fetchedAt: null };

async function fetchLiveHotTerms() {
  // Cache for 3 minutes
  if (liveHotTermsCache.fetchedAt && Date.now() - liveHotTermsCache.fetchedAt < 3 * 60 * 1000) {
    return liveHotTermsCache.terms;
  }

  // Primary: proxy Vercel API (Google hot terms from cloud)
  try {
    const res = await fetch('https://www.toolrankly.com/api/hot-terms', { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const data = await res.json();
      if (data.live && data.live.length > 0) {
        liveHotTermsCache = { terms: data.live, fetchedAt: Date.now() };
        console.log(`  [HotTerms] Fetched ${data.live.length} Google terms (${data.live.filter(t => t.isAiRelated).length} AI-related)`);
        return data.live;
      }
    }
  } catch (e) {
    console.log(`  [HotTerms] Vercel API error: ${e.message}`);
  }

  // Fallback: local sources
  const sources = [ fetchGithubTrending() ];
  const results = await Promise.allSettled(sources);
  const allSourceResults = [];
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      allSourceResults.push(...r.value);
    }
  }
  const termMap = new Map();
  const addTerm = (term, source, weight) => {
    const key = term.toLowerCase().replace(/[^a-z0-9一-鿿]/g, '');
    if (!key || key.length < 2) return;
    if (termMap.has(key)) {
      const existing = termMap.get(key);
      existing.weight += weight;
      if (!existing.sources.includes(source)) existing.sources.push(source);
    } else {
      termMap.set(key, { term, weight, sources: [source], isAiRelated: isAiRelated(term) });
    }
  };
  for (const t of allSourceResults) addTerm(t.term, t.source, t.weight);
  const allTerms = Array.from(termMap.values()).sort((a, b) => b.weight - a.weight).slice(0, 40);
  const aiTerms = allTerms.filter(t => t.isAiRelated);
  const otherTerms = allTerms.filter(t => !t.isAiRelated);
  const sorted = [...aiTerms, ...otherTerms].slice(0, 30);
  liveHotTermsCache = { terms: sorted, fetchedAt: Date.now() };
  console.log(`  [HotTerms] Fallback: ${sorted.length} terms from local sources (${aiTerms.length} AI-related)`);
  return sorted;
}

// ============================================================
// EXPRESS + WEBSOCKET SERVER
// ============================================================

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// CORS middleware
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  next();
});

app.use(express.json());

// GET /api/status
app.get('/api/status', (req, res) => {
  // Load last run info from file if not in memory
  if (!lastRunInfo) {
    try {
      const data = fs.readFileSync(path.join(CRAWLER_DIR, 'last-run.json'), 'utf-8');
      lastRunInfo = JSON.parse(data);
    } catch (e) { /* no file yet */ }
  }
  res.json({
    running: isRunning,
    startTime,
    stats: crawlStats,
    lastRun: lastRunInfo,
    logCount: logHistory.length,
  });
});

// POST /api/start-crawl
app.post('/api/start-crawl', async (req, res) => {
  try {
    await startCrawler(req.body || {});
    res.json({ success: true, message: 'Crawler started' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// POST /api/stop-crawl
app.post('/api/stop-crawl', (req, res) => {
  try {
    stopCrawler();
    res.json({ success: true, message: 'Stopping crawler...' });
  } catch (e) {
    res.status(400).json({ success: false, message: e.message });
  }
});

// GET /api/logs?since=N returns logs after index N
app.get('/api/logs', (req, res) => {
  const since = parseInt(req.query.since, 10) || 0;
  res.json({
    logs: logHistory.slice(since),
    total: logHistory.length,
  });
});

// GET /api/hot-terms — returns live Google hot terms + static config
app.get('/api/hot-terms', async (req, res) => {
  try {
    const liveTerms = await fetchLiveHotTerms();

    // Also return static config for reference
    let staticTerms = [];
    try {
      const crawlerSrc = fs.readFileSync(CRAWLER_SCRIPT, 'utf-8');
      const match = crawlerSrc.match(/const HOT_TERMS = (\[[\s\S]*?\]);/);
      if (match) staticTerms = JSON.parse(match[1]);
    } catch (e) {}

    res.json({
      live: liveTerms,
      static: staticTerms,
      fetchedAt: liveHotTermsCache.fetchedAt,
      source: 'Google Trends + Google News + Google Suggest',
      total: liveTerms.length,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// WEBSOCKET HANDLING
// ============================================================

wss.on('connection', (ws) => {
  clients.add(ws);

  // Send initial state
  ws.send(JSON.stringify({
    type: 'connected',
    data: {
      running: isRunning,
      startTime,
      stats: crawlStats,
      lastRun: lastRunInfo,
      logCount: logHistory.length,
    },
  }));

  // Send log history
  for (const entry of logHistory) {
    try {
      ws.send(JSON.stringify({ type: 'log', data: entry }));
    } catch (e) { break; }
  }

  ws.on('close', () => {
    clients.delete(ws);
  });

  ws.on('error', () => {
    clients.delete(ws);
  });
});

// ============================================================
// START
// ============================================================

server.listen(PORT, () => {
  console.log(`\n  🤖 Crawler Server running on port ${PORT}`);
  console.log(`  ─────────────────────────────`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`  API:       http://localhost:${PORT}/api/status`);
  console.log(`  Dashboard: http://localhost:${PORT}\n`);
});

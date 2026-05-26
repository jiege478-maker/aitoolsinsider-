/**
 * Scrape official AI company tutorial documentation from GitHub cookbook repos.
 * Targets specific repos known to cover different AI domains.
 *
 * Usage:
 *   node crawler/scrape-docs.js
 *   DRY_RUN=true node crawler/scrape-docs.js
 *   LIMIT=5 node crawler/scrape-docs.js
 */

const fs = require('fs');
const path = require('path');
const { marked } = require('marked');

// Load .env
const envFile = path.join(__dirname, '.env');
for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eqIdx = trimmed.indexOf('=');
  if (eqIdx === -1) continue;
  const key = trimmed.substring(0, eqIdx).trim();
  const val = trimmed.substring(eqIdx + 1).trim();
  if (!process.env[key]) process.env[key] = val;
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const DRY_RUN = process.env.DRY_RUN === 'true' || process.argv.includes('DRY_RUN=true');
const MAX_ARTICLES = parseInt(process.env.LIMIT || '10', 10);

if (!SUPABASE_SERVICE_KEY) { console.error('ERROR: SUPABASE_SERVICE_KEY not set.'); process.exit(1); }

const GITHUB_HEADERS = {
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'AI-Tools-Insider-Crawler/1.0',
};

const CATEGORIES = [
  { id: 1, name: 'Writing', slug: 'writing', keywords: ['writing', 'write', 'essay', 'content', 'copywriting', 'blog', 'grammar', 'paraphraser', 'storytelling', 'creative writing', 'article writer', 'text generation', 'nlp', 'natural language', 'language model', 'summarization', 'translation', 'document', 'chatbot', 'conversation', 'semantic', 'sentiment', 'linguistics', 'corpus'] },
  { id: 2, name: 'Image', slug: 'image', keywords: ['image', 'photo', 'stable diffusion', 'midjourney', 'dall-e', 'dalle', 'art', 'design', 'visual', 'image generation', 'generate image', 'ai art', 'illustration', 'photo editing', 'computer vision', 'object detection', 'segmentation', 'generative adversarial', 'vae', 'diffusion model', 'style transfer', 'super resolution', 'image recognition', 'captioning', 'face recognition'] },
  { id: 3, name: 'Coding', slug: 'coding', keywords: ['programming', 'developer', 'github copilot', 'copilot', 'cursor', 'api', 'web dev', 'frontend', 'backend', 'full stack', 'open source', 'sdk', 'debug', 'deploy', 'software development', 'agent', 'framework', 'library', 'tensorflow', 'pytorch', 'code example', 'codebase', 'implementation', 'import', 'dataset', 'algorithm', 'notebook', 'code', 'coding', 'deep learning', 'neural network', 'machine learning'] },
  { id: 4, name: 'Video', slug: 'video', keywords: ['video', 'movie', 'film', 'animation', 'editing', 'screen record', 'motion', 'premiere', 'after effects', 'video generation', 'tiktok', 'youtube', 'render', 'video understanding', 'scene', 'multimodal', 'video editing', 'video classification'] },
  { id: 5, name: 'Productivity', slug: 'productivity', keywords: ['productivity', 'workflow', 'automation', 'meeting', 'note', 'calendar', 'task', 'schedule', 'project management', 'email', 'organization', 'efficiency', 'time management', 'rag', 'retrieval augmented', 'knowledge base', 'recommendation', 'optimization', 'pipeline', 'integration', 'database'] },
];

// Each entry: owner, repo, subpath ('' for root README), label, hint category
const COOKBOOKS = [
  // -- Coding: API usage guides --
  { owner: 'openai', repo: 'openai-cookbook', path: '', label: 'OpenAI Cookbook', hint: 'Coding' },
  { owner: 'anthropics', repo: 'anthropic-cookbook', path: '', label: 'Anthropic Cookbook', hint: 'Coding' },
  { owner: 'google-gemini', repo: 'gemini-api-cookbook', path: '', label: 'Google Gemini Cookbook', hint: 'Coding' },
  { owner: 'meta-llama', repo: 'llama-recipes', path: '', label: 'Meta LLaMA Recipes', hint: 'Coding' },
  // -- Writing: prompt engineering, text --
  { owner: 'dair-ai', repo: 'Prompt-Engineering-Guide', path: '', label: 'DAIR Prompt Engineering Guide', hint: 'Writing' },
  // -- Image: image generation, diffusion models --
  { owner: 'huggingface', repo: 'diffusers', path: '', label: 'HuggingFace Diffusers - Image Generation', hint: 'Image' },
  { owner: 'CompVis', repo: 'stable-diffusion', path: '', label: 'Stable Diffusion by CompVis', hint: 'Image' },
  // -- Video: text-to-video --
  { owner: 'huggingface', repo: 'diffusers', path: 'examples/cogvideo', label: 'HuggingFace CogVideoX - Text-to-Video', hint: 'Video' },
  // -- Productivity: RAG, vector databases, agents --
  { owner: 'run-llama', repo: 'llama_index', path: '', label: 'LlamaIndex - RAG Framework', hint: 'Productivity' },
];

function makeSlug(title) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 100) || 'doc-' + Date.now();
}

function calcReadTime(html) {
  const text = html.replace(/<[^>]+>/g, '').trim();
  return Math.max(1, Math.round(text.split(/\s+/).length / 200));
}

function isEnglish(text) {
  if (!text || text.length < 100) return true;
  const nonAscii = text.replace(/[\x00-\x7F]/g, '').length;
  return nonAscii / text.length < 0.25;
}

function detectCategory(title, content, hintCategory) {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  let best = { id: 3, score: 0 };
  // Hint gives +30 starting bonus — enough to overcome generic coding terms in READMEs
  for (const cat of CATEGORIES) {
    let score = (hintCategory && cat.name === hintCategory) ? 30 : 0;
    for (const kw of cat.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp('\\b' + escaped + '\\b', 'gi');
      const tm = titleLower.match(regex);
      if (tm) score += tm.length * 3;
      const cm = contentLower.match(regex);
      if (cm) score += cm.length;
    }
    if (score > best.score) best = { id: cat.id, score };
  }
  return best.id;
}

async function slugExists(slug) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&limit=1&select=id`, {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY },
  });
  const data = await res.json();
  return data && data.length > 0;
}

async function uploadArticle(article) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(article),
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${await res.text()}`);
  return res.json();
}

function cleanReadme(html) {
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  $('a.anchor, task-lists, .highlight, .blob-wrapper, .clipboard-copy, .snippet-clipboard-content, .zero-width, .sr-only').remove();
  $('.markdown-heading').each(function() {
    const h = $(this).find('h1, h2, h3, h4, h5, h6').first();
    if (h.length) $(this).replaceWith(h); else $(this).remove();
  });
  $('img[src*="shields.io"], img[data-canonical-src*="shields.io"]').remove();
  $('p').each(function() {
    const imgs = $(this).find('img').length;
    if (imgs > 1 && $(this).text().trim().length < 50) $(this).remove();
  });
  $('div[align="right"], div[align="center"]').each(function() {
    if (/English\s*\|/i.test($(this).text())) $(this).remove();
  });
  $('p').each(function() {
    const text = $(this).text();
    if (text.split(/\s+/).length > 15) return;
    if (/sponsor|donate|buy\s+me\s+a\s+coffee|is\s+hiring|prs?\s+welcome|star\s+(this\s+)?repo/i.test(text)) $(this).remove();
  });
  const body = $('body') || $('article') || $('div');
  body.html(body.html().replace(/[░▒▓█▄▀▐▌▔▕]+[^\n]*/g, ''));
  $('a:not([href])').remove();
  let result = $.html() || html;
  result = result.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FB}\u{25FC}\u{25FD}\u{25FE}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '');
  result = result.replace(/<p[^>]*>\s*<\/p>/gi, '');
  result = result.replace(/\n{3,}/g, '\n\n');
  if (result.length > 80000) result = result.substring(0, 80000) + '<p><em>Content truncated...</em></p>';
  return result.trim();
}

async function fetchReadme(owner, repo, subPath) {
  const apiUrl = subPath
    ? `https://api.github.com/repos/${owner}/${repo}/readme/${subPath}`
    : `https://api.github.com/repos/${owner}/${repo}/readme`;
  try {
    const res = await fetch(apiUrl, {
      headers: { ...GITHUB_HEADERS, 'Accept': 'application/vnd.github.v3.html' },
      signal: AbortSignal.timeout(15000),
    });
    if (res.ok) {
      let html = await res.text();
      html = cleanReadme(html);
      if (html.length > 100) return html;
    }
  } catch (e) { /* fallback */ }
  const readmePath = subPath ? (subPath.endsWith('.md') ? subPath : subPath + '/README.md') : 'README.md';
  for (const branch of ['main', 'master']) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${readmePath}`;
    try {
      const rawRes = await fetch(rawUrl, { signal: AbortSignal.timeout(10000) });
      if (rawRes.ok) {
        const md = await rawRes.text();
        if (md.length < 50) continue;
        const rawHtml = marked.parse(md, { async: false });
        return cleanReadme(rawHtml);
      }
    } catch (e) { /* try next */ }
  }
  return '';
}

async function processImages(html, baseUrl) {
  if (!html || html.length < 50) return html;
  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const imgs = $('img[src]');
  if (imgs.length === 0) return html;
  for (const el of imgs) {
    let src = $(el).attr('src');
    if (!src || src.startsWith('data:') || src.includes('shields.io')) continue;
    if (src.startsWith('//')) { src = 'https:' + src; $(el).attr('src', src); }
    else if (src.startsWith('/') && baseUrl) {
      try { src = new URL(baseUrl).origin + src; $(el).attr('src', src); } catch {}
    } else if (!src.startsWith('http') && baseUrl) {
      try {
        const base = new URL(baseUrl);
        if (base.hostname === 'github.com') {
          const parts = base.pathname.replace(/^\//, '').split('/');
          if (parts.length >= 2) {
            src = `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/main/${src}`;
            try {
              const check = await fetch(src, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
              if (!check.ok) src = `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/master/${src}`;
            } catch { src = `https://raw.githubusercontent.com/${parts[0]}/${parts[1]}/master/${src}`; }
            $(el).attr('src', src);
          }
        }
      } catch {}
    }
  }
  return $.html();
}

async function main() {
  console.log('========================================');
  console.log('  AI Company Docs Scraper');
  console.log('  Dry run:', DRY_RUN);
  console.log('  Max:', MAX_ARTICLES);
  console.log('  Targets:', COOKBOOKS.length);
  console.log('========================================\n');

  const dedupFile = path.join(__dirname, 'crawled-urls.json');
  const crawled = [];
  try { crawled.push(...JSON.parse(fs.readFileSync(dedupFile, 'utf-8'))); } catch {}

  let uploaded = 0, skipped = 0, errors = 0;

  for (let i = 0; i < COOKBOOKS.length && uploaded < MAX_ARTICLES; i++) {
    const cb = COOKBOOKS[i];
    const repoUrl = cb.path
      ? `https://github.com/${cb.owner}/${cb.repo}/tree/main/${cb.path}`
      : `https://github.com/${cb.owner}/${cb.repo}`;

    console.log(`[${i+1}/${COOKBOOKS.length}] ${cb.label}`);
    console.log('  URL:', repoUrl);

    if (crawled.some(c => c.url === repoUrl)) {
      console.log('  [DUP] Already crawled');
      skipped++;
      continue;
    }

    console.log('  Fetching README...');
    const readme = await fetchReadme(cb.owner, cb.repo, cb.path || '');

    if (!readme || readme.length < 200) {
      console.log('  [SKIP] README too short:', readme.length, 'chars');
      crawled.push({ url: repoUrl, title: cb.label, date: new Date().toISOString() });
      skipped++;
      continue;
    }

    // Get repo info
    let description = '', topics = [];
    try {
      const infoRes = await fetch(`https://api.github.com/repos/${cb.owner}/${cb.repo}`, {
        headers: GITHUB_HEADERS, signal: AbortSignal.timeout(5000),
      });
      if (infoRes.ok) {
        const info = await infoRes.json();
        description = (info.description || '').substring(0, 300);
        topics = info.topics || [];
      }
    } catch {}

    // Language filter
    const plainText = readme.replace(/<[^>]+>/g, '');
    if (!isEnglish(plainText)) {
      console.log('  [SKIP] Non-English');
      crawled.push({ url: repoUrl, title: cb.label, date: new Date().toISOString() });
      skipped++;
      continue;
    }

    console.log('  Processing images...');
    const readmeHtml = await processImages(readme, repoUrl);

    const title = `${cb.label}: ${description || 'Official tutorials and examples'}`;
    const slug = 'doc-' + makeSlug(cb.label);
    const categoryId = detectCategory(title + ' ' + topics.join(' '), readmeHtml, cb.hint);
    const catName = CATEGORIES.find(c => c.id === categoryId)?.name || 'Coding';
    const readTime = calcReadTime(readmeHtml);

    const footer = '\n<hr><p style="color:#6b7280;font-size:13px;"><em>Source: <a href="' +
      repoUrl + '" rel="nofollow">' + cb.label + '</a></em></p>';
    const fullContent = readmeHtml + footer;

    console.log('  Title:', title.substring(0, 70));
    console.log('  Category:', catName, '(hint was:', cb.hint + ')');
    console.log('  Read time:', readTime, 'min');
    console.log('  Content:', plainText.length, 'chars');

    if (await slugExists(slug)) {
      console.log('  [SKIP] Slug exists');
      crawled.push({ url: repoUrl, title, date: new Date().toISOString() });
      skipped++;
      continue;
    }

    if (DRY_RUN) {
      console.log('  [DRY] Would upload');
      uploaded++;
      continue;
    }

    try {
      const article = {
        title, slug,
        description: description.substring(0, 300) || plainText.substring(0, 200),
        content: fullContent,
        category_id: categoryId,
        tags: ['ai', 'tutorial', cb.owner.toLowerCase(), ...topics.slice(0, 3)],
        read_time: readTime,
        rating: 0,
        featured: true,
        published: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      const result = await uploadArticle(article);
      const id = Array.isArray(result) ? result[0]?.id : result?.id;
      console.log('  [OK] Uploaded as ID', id || '?');
      crawled.push({ url: repoUrl, title, date: new Date().toISOString() });
      uploaded++;
    } catch (e) {
      console.log('  [ERR]', e.message.substring(0, 100));
      errors++;
    }
  }

  fs.writeFileSync(dedupFile, JSON.stringify(crawled, null, 2));
  console.log('\nSummary: uploaded=' + uploaded + ' skipped=' + skipped + ' errors=' + errors);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

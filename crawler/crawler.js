/**
 * AI Tutorial Article Crawler
 *
 * Fetches articles from RSS feeds -> scrapes content -> auto-categorizes -> uploads to Supabase
 *
 * Usage:
 *   node crawler.js              # Normal run
 *   DRY_RUN=true node crawler.js # Dry run (no upload)
 *   LIMIT=5 node crawler.js      # Max 5 articles
 *   SOURCE=medium node crawler.js # Only Medium feeds
 */

const fs = require('fs');
const path = require('path');
const RssParser = require('rss-parser');
const { chromium } = require('playwright');

// ============================================================
// LOAD .ENV FILE
// ============================================================

const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  const envContent = fs.readFileSync(envFile, 'utf-8');
  for (const line of envContent.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

// ============================================================
// CONFIGURATION
// ============================================================

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY not set. Create a .env file or set environment variable.');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_ARTICLES = parseInt(process.env.LIMIT || '10', 10);
const SOURCE_FILTER = process.env.SOURCE || null;

const DEDUP_FILE = path.join(__dirname, 'crawled-urls.json');

// ============================================================
// RSS FEEDS
// ============================================================

const FEEDS = [
  // AI companies first (highest quality)
  { url: 'https://openai.com/blog/feed.xml', name: 'openai' },
  { url: 'https://www.anthropic.com/feed.xml', name: 'anthropic' },
  { url: 'https://ai.googleblog.com/feeds/posts/default', name: 'google-ai' },
  { url: 'https://huggingface.co/blog/feed.xml', name: 'huggingface' },
  { url: 'https://ai.meta.com/blog/feed.xml', name: 'meta-ai' },
  // Community
  { url: 'https://medium.com/feed/tag/artificial-intelligence', name: 'medium-ai' },
  { url: 'https://medium.com/feed/tag/ai', name: 'medium-ai' },
  { url: 'https://medium.com/feed/tag/machine-learning', name: 'medium-ml' },
  { url: 'https://dev.to/feed/tag/ai', name: 'devto-ai' },
  { url: 'https://dev.to/feed/tag/machinelearning', name: 'devto-ml' },
  { url: 'https://www.reddit.com/r/artificial/.rss', name: 'reddit-ai' },
  { url: 'https://www.reddit.com/r/MachineLearning/.rss', name: 'reddit-ml' },
  { url: 'https://www.analyticsvidhya.com/blog/feed/', name: 'av' },
  { url: 'https://www.marktechpost.com/feed/', name: 'mtp' },
];

// GitHub repos: search for AI tutorial repos
const GITHUB_SEARCH_QUERIES = [
  'topic:ai+topic:tutorial+stars:>100',
  'topic:machine-learning+tutorial+stars:>200',
  'topic:deep-learning+tutorial+stars:>200',
  'topic:llm+tutorial+stars:>100',
  'topic:artificial-intelligence+tutorial+stars:>100',
];

const GITHUB_API_HEADERS = {
  'Accept': 'application/vnd.github.v3+json',
  'User-Agent': 'AI-Tools-Insider-Crawler/1.0',
};

// ============================================================
// CATEGORY KEYWORDS
// ============================================================

const CATEGORIES = [
  { id: 1, name: 'Writing', keywords: ['writing', 'write', 'essay', 'content', 'copywriting', 'blog', 'grammar', 'paraphraser', 'storytelling', 'creative writing', 'article writer', 'text generation', 'nlp', 'natural language', 'language model', 'summarization', 'translation', 'document', 'chatbot', 'conversation', 'semantic', 'sentiment', 'linguistics', 'corpus'] },
  { id: 2, name: 'Image', keywords: ['image', 'photo', 'stable diffusion', 'midjourney', 'dall-e', 'dalle', 'art', 'design', 'visual', 'image generation', 'generate image', 'ai art', 'illustration', 'photo editing', 'computer vision', 'object detection', 'segmentation', 'generative adversarial', 'vae', 'diffusion model', 'style transfer', 'super resolution', 'image recognition', 'captioning', 'face recognition'] },
  { id: 3, name: 'Coding', keywords: ['programming', 'developer', 'github copilot', 'copilot', 'cursor', 'api', 'web dev', 'frontend', 'backend', 'full stack', 'open source', 'sdk', 'debug', 'deploy', 'software development', 'agent', 'framework', 'library', 'tensorflow', 'pytorch', 'code example', 'codebase', 'implementation', 'import', 'dataset', 'algorithm', 'notebook', 'code', 'coding', 'deep learning', 'neural network', 'machine learning'] },
  { id: 4, name: 'Video', keywords: ['video', 'movie', 'film', 'animation', 'editing', 'screen record', 'motion', 'premiere', 'after effects', 'video generation', 'tiktok', 'youtube', 'render', 'video understanding', 'scene', 'multimodal', 'video editing', 'video classification'] },
  { id: 5, name: 'Productivity', keywords: ['productivity', 'workflow', 'automation', 'meeting', 'note', 'calendar', 'task', 'schedule', 'project management', 'email', 'organization', 'efficiency', 'time management', 'rag', 'retrieval augmented', 'knowledge base', 'recommendation', 'optimization', 'pipeline', 'integration', 'database'] },
];

const ALL_KEYWORDS = CATEGORIES.flatMap(c => c.keywords);

// ============================================================
// DEDUP
// ============================================================

function loadCrawled() {
  try {
    return JSON.parse(fs.readFileSync(DEDUP_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function saveCrawled(data) {
  fs.writeFileSync(DEDUP_FILE, JSON.stringify(data, null, 2));
}

function isAlreadyCrawled(url, crawled) {
  return crawled.some(c => c.url === url);
}

// ============================================================
// SLUG GENERATION
// ============================================================

function makeSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 100) || 'article-' + Date.now();
}

// ============================================================
// CATEGORY DETECTION
// ============================================================

function detectCategory(title, content) {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  let best = { id: 1, score: 0 };

  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

      // Title matches get 3x weight
      const titleMatches = titleLower.match(regex);
      if (titleMatches) score += titleMatches.length * 3;

      // Content matches get 1x weight
      const contentMatches = contentLower.match(regex);
      if (contentMatches) score += contentMatches.length;
    }
    if (score > best.score) {
      best = { id: cat.id, score };
    }
  }

  return best.id;
}

// ============================================================
// READ TIME CALCULATION
// ============================================================

function calcReadTime(html) {
  const text = html.replace(/<[^>]+>/g, '').trim();
  const words = text.split(/\s+/).length;
  return Math.max(1, Math.round(words / 200));
}

// ============================================================
// AI RELEVANCE CHECK (pre-scrape filter)
// ============================================================

function isAiRelevant(title, description) {
  const titleLower = (title || '').toLowerCase();
  const descLower = (description || '').toLowerCase();
  // Must have AI keywords in the title itself
  const titleAiKeywords = /ai|artificial.intelligence|machine.learning|deep.learning|llm|gpt|chatgpt|chat.?gpt|neural|prompt|agent|bot|nlp|computer.vision|tensorflow|pytorch|algorithm|stable.diffusion|midjourney|dalle|openai|anthropic|claude|gemini|llama|mistral|copilot|langchain|hugging.?face|gradio|generative|model|training|fine.?tune|RAG|embedding|vector|transformer|diffusion/i;
  if (titleAiKeywords.test(titleLower)) return true;
  // Title-only fallback for very common terms
  const titleCommonAI = /chat.?gpt|gpt.?4|gpt4|gpt.?3|dalle|midjourney|stable.?diffusion|claude|gemini|llama|mistral|copilot|openai|anthropic|hugging.?face/i;
  return titleCommonAI.test(titleLower);
}

// ============================================================
// CONTENT QUALITY CHECK (post-scrape)
// ============================================================

function isQualityContent(title, html) {
  const text = html.replace(/<[^>]+>/g, '').trim();
  const words = text.split(/\s+/);

  // Must have at least 100 words
  if (words.length < 100) return false;

  // Count article-like elements
  const hasParagraphs = /<p>/i.test(html);
  const hasHeadings = /<h[1-6]/i.test(html);
  const noiseRatio = (html.match(/comment|discuss|reply|join/i) || []).length / Math.max(1, words.length);

  // Too much discussion/commentary = low quality
  if (noiseRatio > 0.05) return false;

  return hasParagraphs || hasHeadings;
}

// ============================================================
// SPAM DETECTION
// ============================================================

function isSpam(title, content) {
  const text = (title + ' ' + content).toLowerCase();
  const spamPatterns = [
    /buy\s+(old\s+)?(gmail|account|followers|views|likes|traffic|backlinks)/i,
    /cheap\s+(gmail|account|service|pva|followers)/i,
    /sell\s+(gmail|account|pva)/i,
    /crypto\s+payment/i,
    /click\s+here/i,
    /earn\s+money\s+fast/i,
    /work\s+from\s+home\s+making/i,
    /buy\s+aged/i,
    /pva\s+accounts/i,
    /casino|gambling|betting/i,
    /china.dictatorship|freetaiwan|tibet.independence/i,
    /çl\|cker|çl1cker/i,
    /autonomous.payments/i,
  ];
  // Also skip if no AI-related keywords in title or first 500 chars
  const aiKeywords = /ai|artificial.intelligence|machine.learning|deep.learning|llm|gpt|chatgpt|neural|model|automation|data.?science|prompt|agent|bot|nlp|computer.vision|tensorflow|pytorch|algorithm|train|stable.diffusion|midjourney|dalle/i;
  if (!aiKeywords.test(text.substring(0, 500))) {
    return true; // Not clearly AI-related
  }
  return spamPatterns.some(p => p.test(text));
}

// ============================================================
// LANGUAGE DETECTION
// ============================================================

function isEnglish(text) {
  if (!text || text.length < 100) return true; // Too short to judge, allow it
  // Count non-ASCII characters (Chinese, Japanese, Korean, Arabic, etc.)
  const nonAscii = text.replace(/[\x00-\x7F]/g, '').length;
  const ratio = nonAscii / text.length;
  return ratio < 0.25; // Less than 25% non-ASCII = English
}

// ============================================================
// HTML CONTENT EXTRACTION & CLEANING
// ============================================================

function cleanContent($) {
  // Remove noise elements
  $('script, style, nav, header, footer, aside, iframe').remove();
  $('.sidebar, .comments, .comment, .social-share, .share, .ad, .advertisement, .ads, .banner').remove();
  $('[role="navigation"], [role="complementary"]').remove();
  // Remove dev.to/forum UI elements at bottom of articles
  $('.discussion, .thread, .replies, .comment-form, .reply-form, .comment-list, .comment-box').remove();
  $('[id*="comment"], [class*="comment"], [class*="discussion"], [class*="thread"]').remove();
  // Remove billboard/ad containers
  $('[class*="billboard"], [id*="billboard"], [class*="promo"], [class*="sentry"]').remove();
  // Remove "join the discussion" type sections
  $('section:contains("join the discussion"), section:contains("leave a comment"), section:contains("comments")').remove();
  $('div:contains("Join the discussion"), div:contains("Leave a comment")').remove();
  // Remove bottom-of-page noise (template, create template, etc.)
  $('[class*="template"], [class*="create-post"], [class*="draft"]').remove();

  // Try common article selectors
  let article = $('article').first();
  if (article.length === 0) article = $('[itemprop="articleBody"]');
  if (article.length === 0) article = $('.post-content');
  if (article.length === 0) article = $('.entry-content');
  if (article.length === 0) article = $('.article-content');
  if (article.length === 0) article = $('.content');
  if (article.length === 0) article = $('main');
  if (article.length === 0) article = $('body');

  // Clean remaining noise within the selected content
  article.find('script, style, iframe[src*="ads"], .ads, .ad, .social-share, .share').remove();

  // Get clean HTML
  let html = article.html() || '';

  // Strip emoji characters from content
  html = html.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FB}\u{25FC}\u{25FD}\u{25FE}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '');

  // Remove empty paragraphs
  html = html.replace(/<p[^>]*>\s*<\/p>/gi, '');

  // Remove "join discussion" / comment / billboard sections
  html = html.replace(/<section[^>]*>.*?\b(join the discussion|leave a comment|comments?|discussion|advertisement|billboard)\b.*?<\/section>/gis, '');
  html = html.replace(/<div[^>]*>.*?\b(join the discussion|leave a comment|template for|create template)\b.*?<\/div>/gis, '');

  // Remove excessive whitespace
  html = html.replace(/\n{3,}/g, '\n\n');

  // Limit content length (prevent absurdly long articles)
  if (html.length > 50000) {
    html = html.substring(0, 50000) + '<p><em>Content truncated...</em></p>';
  }

  return html.trim();
}

function extractDescription($) {
  // Try meta description
  const metaDesc = $('meta[name="description"]').attr('content');
  if (metaDesc) return metaDesc.substring(0, 200);

  // Try first paragraph
  const firstP = $('p').first().text().trim();
  if (firstP) return firstP.substring(0, 200);

  return '';
}

function extractDate(item) {
  return item.isoDate || item.pubDate || new Date().toISOString();
}

// ============================================================
// SUPABASE UPLOAD
// ============================================================

async function slugExists(slug) {
  const url = `${SUPABASE_URL}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&limit=1&select=id`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_ANON_KEY,
      'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
    },
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

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Upload failed (${res.status}): ${err}`);
  }

  return res.json();
}

// ============================================================
// IMAGE PROCESSING (download external images, upload to Supabase)
// ============================================================

async function downloadAndUploadImage(imgUrl) {
  // Skip if already on our Supabase
  if (imgUrl.includes(SUPABASE_URL) || imgUrl.startsWith('data:')) return imgUrl;

  try {
    const res = await fetch(imgUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return imgUrl;

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.startsWith('image/')) return imgUrl;

    const buffer = await res.arrayBuffer();

    // Skip >5MB images
    if (buffer.byteLength > 5 * 1024 * 1024) {
      console.log(`    [SKIP] Image too large (${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB): ${imgUrl.substring(0, 60)}`);
      return imgUrl;
    }

    const ext = (contentType.split('/')[1] || 'jpg').split(';')[0].replace('svg+xml', 'svg');
    const filename = 'crawled-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6) + '.' + ext;

    const uploadRes = await fetch(`${SUPABASE_URL}/storage/v1/object/articles/${filename}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
        'Content-Type': contentType,
      },
      body: buffer,
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.log(`    [SKIP] Upload failed (${uploadRes.status}): ${errText.substring(0, 80)}`);
      return imgUrl;
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/articles/${filename}`;
    console.log(`    [IMG] Uploaded: ${filename}`);
    return publicUrl;
  } catch (e) {
    console.log(`    [IMG] Error: ${e.message}`);
    return imgUrl;
  }
}

async function processImages(html, baseUrl) {
  if (!html || html.length < 50) return html;

  const cheerio = require('cheerio');
  const $ = cheerio.load(html);
  const imgs = $('img[src]');
  if (imgs.length === 0) return html;

  let replaced = 0;
  for (const el of imgs) {
    let src = $(el).attr('src');
    if (!src || src.startsWith('data:')) continue;

    // Skip badge/icon images — they break when re-uploaded
    if (src.includes('img.shields.io') || src.includes('badge/') || src.includes('shields.io')) {
      continue;
    }

    // Resolve relative URLs to absolute
    const originalSrc = src;
    if (src.startsWith('//')) {
      src = 'https:' + src;
    } else if (src.startsWith('/') && baseUrl) {
      const parsed = new URL(baseUrl);
      src = parsed.origin + src;
    } else if (!src.startsWith('http') && baseUrl) {
      // For GitHub repos, resolve relative images to raw.githubusercontent.com
      const baseUrlObj = new URL(baseUrl);
      if (baseUrlObj.hostname === 'github.com') {
        const parts = baseUrlObj.pathname.replace(/^\//, '').split('/');
        if (parts.length >= 2) {
          const [owner, repo] = parts;
          // Try main first, then fallback to master
          src = `https://raw.githubusercontent.com/${owner}/${repo}/main/${src}`;
          // Check if file exists on main before trying master
          try {
            const check = await fetch(src, { method: 'HEAD', signal: AbortSignal.timeout(3000) });
            if (!check.ok) src = `https://raw.githubusercontent.com/${owner}/${repo}/master/${src}`;
          } catch { src = `https://raw.githubusercontent.com/${owner}/${repo}/master/${src}`; }
        } else {
          src = new URL(src, baseUrl).href;
        }
      } else {
        src = new URL(src, baseUrl).href;
      }
    }

    // Always update element src if resolution changed it (even if upload fails)
    if (src !== originalSrc) {
      $(el).attr('src', src);
    }

    const newSrc = await downloadAndUploadImage(src);
    if (newSrc !== src) {
      $(el).attr('src', newSrc);
      replaced++;
    }

    // Delay between uploads
    if (replaced > 0 && replaced % 3 === 0) await new Promise(r => setTimeout(r, 500));
  }

  if (replaced > 0) console.log(`    [IMG] ${replaced}/${imgs.length} images processed`);
  return $.html();
}

// ============================================================
// FEED PARSING
// ============================================================

const rssParser = new RssParser({
  timeout: 15000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
  },
});

async function fetchFeed(feedConfig) {
  console.log(`  Fetching ${feedConfig.name}...`);
  try {
    const feed = await rssParser.parseURL(feedConfig.url);
    return (feed.items || []).map(item => ({
      ...item,
      _source: feedConfig.name,
    }));
  } catch (e) {
    console.log(`  [SKIP] ${feedConfig.name}: ${e.message}`);
    return [];
  }
}

// ============================================================
// CONTENT SCRAPING WITH PLAYWRIGHT
// ============================================================

async function scrapeContent(url) {
  const browser = await chromium.launch({ headless: true });
  let result = { content: '', description: '', title: '' };

  try {
    const page = await browser.newPage();
    await page.setDefaultTimeout(15000);

    // Block images and fonts for faster loading
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,eot}', route => route.abort());

    await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });

    // Wait for content to render
    await page.waitForTimeout(2000);

    // Get page content
    const html = await page.content();

    // Load into cheerio
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    result.content = cleanContent($);
    result.description = extractDescription($);

    // Clean title: remove site name suffixes like " - DEV Community"
    let rawTitle = $('h1').first().text().trim() || $('title').text().trim();
    rawTitle = rawTitle.replace(/\s*[–—-]\s*.+$/, '').trim();
    rawTitle = rawTitle.replace(/Enter fullscreen mode.*/i, '').trim();
    rawTitle = rawTitle.replace(/\s{2,}/g, ' ').trim();
    result.title = rawTitle;

    await page.close();
  } catch (e) {
    console.log(`    Scrape error: ${e.message}`);
    result.content = '';
  } finally {
    await browser.close();
  }

  return result;
}

// ============================================================
// GITHUB SOURCE PROCESSING
// ============================================================

async function searchGitHubRepos() {
  const results = [];
  for (const query of GITHUB_SEARCH_QUERIES) {
    const url = `https://api.github.com/search/repositories?q=${query}&sort=stars&per_page=3`;
    try {
      console.log(`  Searching GitHub: ${query.substring(0, 50)}...`);
      const res = await fetch(url, { headers: GITHUB_API_HEADERS, signal: AbortSignal.timeout(10000) });
      if (!res.ok) {
        console.log(`  [SKIP] GitHub API (${res.status}): ${res.statusText}`);
        if (res.status === 403) break; // Rate limited
        continue;
      }
      const data = await res.json();
      for (const repo of (data.items || [])) {
        if (!results.some(r => r.name === repo.full_name)) {
          results.push({
            owner: repo.owner.login,
            repo: repo.name,
            name: repo.full_name,
            description: (repo.description || '').substring(0, 300),
            stars: repo.stargazers_count,
            url: repo.html_url,
            topics: repo.topics || [],
          });
        }
      }
    } catch (e) {
      console.log(`  [SKIP] GitHub search error: ${e.message}`);
    }
  }
  return results;
}

async function fetchGithubReadme(owner, repo) {
  // Try rendered HTML via GitHub API
  const apiUrl = `https://api.github.com/repos/${owner}/${repo}/readme`;
  try {
    const res = await fetch(apiUrl, {
      headers: {
        ...GITHUB_API_HEADERS,
        'Accept': 'application/vnd.github.v3.html',
      },
    });
    if (res.ok) {
      let html = await res.text();
      // Clean up GitHub wrapping elements
      const cheerio = require('cheerio');
      const $ = cheerio.load(html);

      // Remove GitHub UI wrappers
      $('a.anchor, task-lists, .highlight, .blob-wrapper, .clipboard-copy, .snippet-clipboard-content, .zero-width, .sr-only').remove();

      // Remove shields.io badge images entirely (their alt text pollutes content)
      $('img[src*="shields.io"], img[data-canonical-src*="shields.io"]').remove();

      // Unwrap heading elements from markdown-heading containers, then remove them
      $('.markdown-heading').each(function() {
        const heading = $(this).find('h1, h2, h3, h4, h5, h6').first();
        if (heading.length) {
          $(this).replaceWith(heading);
        } else {
          $(this).remove();
        }
      });

      // Remove badge rows at top (shields.io badge paragraphs)
      $('p[align="center"]').each(function() {
        const imgs = $(this).find('img[src*="shields.io"], img[data-canonical-src*="shields.io"], img[src*="badge"]');
        if (imgs.length > 1) {
          $(this).remove();
        }
      });

      // Remove standalone badge paragraphs (no align attribute but contain only badges)
      $('p').each(function() {
        const imgs = $(this).find('img[src*="shields.io"], img[data-canonical-src*="shields.io"]');
        const allLinks = $(this).find('a').length;
        if (imgs.length > 0 && imgs.length === allLinks && $(this).text().trim().length < 50) {
          $(this).remove();
        }
      });

      // Remove mermaid flowchart config blocks
      $('code').each(function() {
        const text = $(this).text();
        if (text.includes('%%{') || text.includes('flowchart ') || text.includes('graph ')) {
          $(this).parent().remove();
        }
      });

      // Remove ASCII art lines (box-drawing chars)
      const body = $('body') || $('article') || $('div');
      body.html(body.html().replace(/[░▒▓█▄▀▐▌▔▕]+[^\n]*/g, ''));

      // Remove empty href-less anchor tags (GitHub heading anchors that slip through)
      $('a:not([href])').remove();

      // Remove social link rows (LinkedIn, Twitter, Discord, Reddit clusters)
      $('p').each(function() {
        const text = $(this).text().toLowerCase();
        const socialLinks = $(this).find('a[href*="linkedin"], a[href*="twitter"], a[href*="discord"], a[href*="reddit"], a[href*="facebook"]').length;
        const socialMentions = (text.match(/linkedin|twitter|discord|reddit|facebook/i) || []).length;
        if (socialLinks >= 2 || (socialMentions >= 2 && $(this).text().split(/\s+/).length < 20)) {
          $(this).remove();
        }
      });

      // Remove sponsor/donate/hiring paragraphs (short ones)
      $('p').each(function() {
        const text = $(this).text();
        const words = text.split(/\s+/).length;
        if (words > 20) return;
        if (/sponsor|donate|buy\s+me\s+a\s+coffee|is\s+hiring|we.+(re|are)\s+hiring|prs?\s+welcome|pull\s+requests?\s+(are\s+)?welcome|contributions?\s+welcome|star\s+(this\s+)?repo|don'?t\s+forget\s+to\s+star/i.test(text)) {
          $(this).remove();
        }
      });

      // Remove language switcher divs ("English | 中文")
      $('div[align="right"], div[align="center"]').each(function() {
        const text = $(this).text().trim();
        if (/English\s*\|/i.test(text) || /\|\s*English/i.test(text)) {
          $(this).remove();
        }
      });

      let result = $.html() || html;
      // Strip emoji characters
      result = result.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FB}\u{25FC}\u{25FD}\u{25FE}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '');

      // Check if content is English; if not, try reading README_EN.md
      const plainText = result.replace(/<[^>]+>/g, '');
      if (!isEnglish(plainText)) {
        // Try fetching the English version of the README
        for (const branch of ['main', 'master']) {
          const enUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README_EN.md`;
          try {
            const enRes = await fetch(enUrl);
            if (enRes.ok) {
              const enMd = await enRes.text();
              if (isEnglish(enMd)) {
                const cheerio2 = require('cheerio');
                // Wrap in pre tag for raw markdown display
                return `<pre style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${enMd.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
              }
            }
          } catch (e) { /* try next branch */ }
        }
        // No English version available — return empty so caller skips this repo
        return '';
      }

      return result;
    }
  } catch (e) { /* fall through to raw */ }

  // Fallback: fetch raw README.md
  for (const branch of ['main', 'master']) {
    const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/README.md`;
    try {
      const res = await fetch(rawUrl);
      if (res.ok) {
        const md = await res.text();
        return `<pre style="white-space:pre-wrap;font-size:14px;line-height:1.6;">${md.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>`;
      }
    } catch (e) { /* try next branch */ }
  }
  return '';
}

// ============================================================
// MAIN
// ============================================================

async function main() {
  console.log('========================================');
  console.log('  AI Tutorial Article Crawler');
  console.log(`  Dry run: ${DRY_RUN}`);
  console.log(`  Max articles: ${MAX_ARTICLES}`);
  console.log(`  Source filter: ${SOURCE_FILTER || 'all'}`);
  console.log('========================================\n');

  // Load dedup cache
  const crawled = loadCrawled();
  console.log(`Already crawled: ${crawled.length} URLs\n`);

  // Filter feeds
  let feeds = FEEDS;
  if (SOURCE_FILTER) {
    feeds = feeds.filter(f => f.name.includes(SOURCE_FILTER));
    console.log(`Filtered to ${feeds.length} feed(s) matching "${SOURCE_FILTER}"\n`);
  }

  let processed = 0;
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  for (const feedConfig of feeds) {
    if (processed >= MAX_ARTICLES) break;

    const items = await fetchFeed(feedConfig);

    for (const item of items) {
      if (processed >= MAX_ARTICLES) break;

      const url = item.link || item.guid;
      if (!url) continue;

      processed++;

      // Dedup check 1: already in crawled list
      if (isAlreadyCrawled(url, crawled)) {
        console.log(`  [DUP] ${item.title?.substring(0, 60)}...`);
        skipped++;
        continue;
      }

      console.log(`\n[${processed}/${MAX_ARTICLES}] ${item.title?.substring(0, 70)}`);
      console.log(`  URL: ${url}`);

      // AI relevance check (pre-scrape filter)
      if (!isAiRelevant(item.title || '', item.contentSnippet || '')) {
        console.log(`  [SKIP] Not AI-related (title: "${item.title?.substring(0, 60)}")`);
        skipped++;
        continue;
      }

      // Scrape content
      console.log(`  Scraping...`);
      const scraped = await scrapeContent(url);

      if (!scraped.content || scraped.content.length < 200) {
        console.log(`  [SKIP] Content too short or empty`);
        skipped++;
        continue;
      }

      // Language filter: skip non-English content
      const contentPlainText = scraped.content.replace(/<[^>]+>/g, '');
      if (!isEnglish(contentPlainText)) {
        console.log(`  [SKIP] Non-English content`);
        skipped++;
        continue;
      }

      // Quality check
      const qualityTitle = item.title || scraped.title || '';
      if (!isQualityContent(qualityTitle, scraped.content)) {
        console.log(`  [SKIP] Low quality content (discussion page or too short)`);
        skipped++;
        continue;
      }

      // Spam filter
      const checkTitle = item.title || scraped.title || '';
      if (isSpam(checkTitle, scraped.content)) {
        console.log(`  [SKIP] Spam detected`);
        skipped++;
        continue;
      }

      // Build article data
      const title = item.title || scraped.title || 'Untitled';
      const slug = makeSlug(title);
      const description = scraped.description || item.contentSnippet?.substring(0, 200) || '';
      console.log(`  Processing images...`);
      const contentHtml = await processImages(scraped.content, url);
      const categoryId = detectCategory(title, contentHtml);
      const readTime = calcReadTime(contentHtml);
      const pubDate = extractDate(item);

      // Add source attribution
      const sourceLine = `<hr><p style="color:#6b7280;font-size:13px;"><em>Source: <a href="${url}" rel="nofollow">${url}</a></em></p>`;
      const fullContent = contentHtml + '\n' + sourceLine;

      // Dedup check 2: slug exists in DB
      console.log(`  Category: ${CATEGORIES.find(c => c.id === categoryId)?.name}`);
      console.log(`  Slug: ${slug}`);
      console.log(`  Read time: ${readTime} min`);

      const slugExistsInDb = await slugExists(slug);
      if (slugExistsInDb) {
        console.log(`  [SKIP] Slug already exists in database`);
        crawled.push({ url, title, date: new Date().toISOString() });
        skipped++;
        continue;
      }

      if (DRY_RUN) {
        console.log(`  [DRY RUN] Would upload: "${title}"`);
        crawled.push({ url, title, date: new Date().toISOString() });
        uploaded++;
        continue;
      }

      // Upload
      try {
        const articleData = {
          title,
          slug,
          description: description.substring(0, 300),
          content: fullContent,
          category_id: categoryId,
          tags: ['ai', 'tutorial', feedConfig.name.replace(/[0-9]/g, '')],
          read_time: readTime,
          rating: 0,
          featured: false,
          published: true,
          created_at: pubDate,
          updated_at: new Date().toISOString(),
        };

        const result = await uploadArticle(articleData);
        const resultId = Array.isArray(result) ? result[0]?.id : result?.id;
        console.log(`  [OK] Uploaded as ID ${resultId || '?'}`);
        crawled.push({ url, title, date: new Date().toISOString() });
        uploaded++;
      } catch (e) {
        console.log(`  [ERR] ${e.message}`);
        errors++;
      }

      // Rate limiting delay
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  // ============================================================
  // Process GitHub tutorial repos
  // ============================================================
  if (!SOURCE_FILTER || SOURCE_FILTER === 'github') {
    console.log('\n--- GitHub Tutorial Repos ---\n');
    try {
      const repos = await searchGitHubRepos();
      console.log(`Found ${repos.length} potential tutorial repos\n`);

      for (const repoInfo of repos) {
        if (processed >= MAX_ARTICLES) break;

        const repoUrl = repoInfo.url;
        processed++;

        if (isAlreadyCrawled(repoUrl, crawled)) {
          console.log(`  [DUP] ${repoInfo.name}`);
          skipped++;
          continue;
        }

        console.log(`\n[${processed}/${MAX_ARTICLES}] ${repoInfo.name}`);
        console.log(`  URL: ${repoUrl}`);
        console.log(`  Stars: ${repoInfo.stars} | Topics: ${repoInfo.topics.join(', ') || 'none'}`);

        if (!isAiRelevant(repoInfo.name + ' ' + repoInfo.description, repoInfo.description)) {
          console.log(`  [SKIP] Not AI-related`);
          skipped++;
          continue;
        }

        console.log(`  Fetching README...`);
        const rawReadme = await fetchGithubReadme(repoInfo.owner, repoInfo.repo);

        if (!rawReadme || rawReadme.length < 200) {
          console.log(`  [SKIP] README too short or empty`);
          skipped++;
          continue;
        }

        console.log(`  Processing images...`);
        const readmeHtml = await processImages(rawReadme, repoInfo.url);

        if (!isQualityContent(repoInfo.name, readmeHtml)) {
          console.log(`  [SKIP] Low quality README`);
          skipped++;
          continue;
        }

        const title = `${repoInfo.name}: ${repoInfo.description}`;
        const slug = `github-${makeSlug(repoInfo.name)}`;
        const categoryId = detectCategory(title + ' ' + repoInfo.topics.join(' '), readmeHtml);
        const readTime = calcReadTime(readmeHtml);

        const sourceLine = `<hr><p style="color:#6b7280;font-size:13px;"><em>Source: <a href="${repoInfo.url}" rel="nofollow">GitHub: ${repoInfo.name}</a> (${repoInfo.stars} stars${repoInfo.topics.length > 0 ? ', ' + repoInfo.topics.join(', ') : ''})</em></p>`;
        const fullContent = readmeHtml + '\n' + sourceLine;

        console.log(`  Category: ${CATEGORIES.find(c => c.id === categoryId)?.name}`);
        console.log(`  Slug: ${slug}`);

        if (await slugExists(slug)) {
          console.log(`  [SKIP] Slug already exists in database`);
          crawled.push({ url: repoUrl, title, date: new Date().toISOString() });
          skipped++;
          continue;
        }

        if (DRY_RUN) {
          console.log(`  [DRY RUN] Would upload: "${title.substring(0, 60)}"`);
          crawled.push({ url: repoUrl, title, date: new Date().toISOString() });
          uploaded++;
          continue;
        }

        try {
          const articleData = {
            title,
            slug,
            description: repoInfo.description.substring(0, 300),
            content: fullContent,
            category_id: categoryId,
            tags: ['ai', 'tutorial', 'github', ...repoInfo.topics.slice(0, 3)],
            read_time: readTime,
            rating: 0,
            featured: false,
            published: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const result = await uploadArticle(articleData);
          const resultId = Array.isArray(result) ? result[0]?.id : result?.id;
          console.log(`  [OK] Uploaded as ID ${resultId || '?'}`);
          crawled.push({ url: repoUrl, title, date: new Date().toISOString() });
          uploaded++;
        } catch (e) {
          console.log(`  [ERR] ${e.message}`);
          errors++;
        }

        await new Promise(r => setTimeout(r, 1000));
      }
    } catch (e) {
      console.log(`GitHub processing error: ${e.message}`);
    }
  }

  // Save dedup cache
  saveCrawled(crawled);

  console.log('\n========================================');
  console.log('  Summary');
  console.log('========================================');
  console.log(`  Processed: ${processed}`);
  console.log(`  Uploaded:  ${uploaded}`);
  console.log(`  Skipped:   ${skipped}`);
  console.log(`  Errors:    ${errors}`);
  console.log('========================================');
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});

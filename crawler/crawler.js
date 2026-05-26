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
// CONFIGURATION
// ============================================================

const SUPABASE_URL = 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbnBobXZqaWp2aGdyam5lcG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTM1ODYsImV4cCI6MjA5NTM4OTU4Nn0._it7-0Izx-FW6SYvTNvz20v56J7USqmXVOWrEaIStps';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbnBobXZqaWp2aGdyam5lcG5vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgxMzU4NiwiZXhwIjoyMDk1Mzg5NTg2fQ.Z9V0aHGsrRQjgb4C1F3V4WzfTpGlJUgA34OKI3U09bc';

const DRY_RUN = process.env.DRY_RUN === 'true';
const MAX_ARTICLES = parseInt(process.env.LIMIT || '10', 10);
const SOURCE_FILTER = process.env.SOURCE || null;

const DEDUP_FILE = path.join(__dirname, 'crawled-urls.json');

// ============================================================
// RSS FEEDS
// ============================================================

const FEEDS = [
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

// ============================================================
// CATEGORY KEYWORDS
// ============================================================

const CATEGORIES = [
  { id: 1, name: 'Writing', keywords: ['writing', 'write', 'essay', 'content', 'copywriting', 'blog', 'grammar', 'paraphraser', 'storytelling', 'creative writing', 'article writer', 'text generation', 'nlp'] },
  { id: 2, name: 'Image', keywords: ['image', 'photo', 'stable diffusion', 'midjourney', 'dall-e', 'dalle', 'art', 'design', 'canvas', 'visual', 'image generation', 'generate image', 'ai art', 'illustration', 'photo editing'] },
  { id: 3, name: 'Coding', keywords: ['code', 'programming', 'developer', 'github copilot', 'copilot', 'cursor', 'api', 'build', 'deploy', 'debug', 'software', 'app', 'web dev', 'frontend', 'backend', 'full stack', 'engineer', 'program', 'open source', 'github', 'repository', 'agent', 'framework', 'sdk', 'library', 'function'] },
  { id: 4, name: 'Video', keywords: ['video', 'movie', 'film', 'animation', 'editing', 'screen record', 'motion', 'premiere', 'after effects', 'video generation', 'tiktok', 'youtube', 'clip', 'render'] },
  { id: 5, name: 'Productivity', keywords: ['productivity', 'workflow', 'automation', 'meeting', 'note', 'calendar', 'task', 'schedule', 'project management', 'email', 'organization', 'efficiency', 'time management'] },
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
      const regex = new RegExp(escaped, 'gi');

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
// HTML CONTENT EXTRACTION & CLEANING
// ============================================================

function cleanContent($) {
  // Remove noise elements
  $('script, style, nav, header, footer, aside, iframe').remove();
  $('.sidebar, .comments, .comment, .social-share, .share, .ad, .advertisement, .ads, .banner').remove();
  $('[role="navigation"], [role="complementary"]').remove();

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

  // Remove empty paragraphs
  html = html.replace(/<p[^>]*>\s*<\/p>/gi, '');

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
// FEED PARSING
// ============================================================

const rssParser = new RssParser({
  timeout: 30000,
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

      // Scrape content
      console.log(`  Scraping...`);
      const scraped = await scrapeContent(url);

      if (!scraped.content || scraped.content.length < 200) {
        console.log(`  [SKIP] Content too short or empty`);
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
      const contentHtml = scraped.content;
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

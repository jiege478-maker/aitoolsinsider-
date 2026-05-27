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
  // ===== AI Companies =====
  { url: 'https://openai.com/blog/feed.xml', name: 'openai' },
  { url: 'https://www.anthropic.com/feed.xml', name: 'anthropic' },
  { url: 'https://ai.googleblog.com/feeds/posts/default', name: 'google-ai' },
  { url: 'https://huggingface.co/blog/feed.xml', name: 'huggingface' },
  { url: 'https://ai.meta.com/blog/feed.xml', name: 'meta-ai' },
  { url: 'https://stability.ai/blog/feed.xml', name: 'stability' },
  { url: 'https://mistral.ai/feed.xml', name: 'mistral' },
  { url: 'https://cohere.com/blog/feed.xml', name: 'cohere' },
  { url: 'https://blog.langchain.dev/feed.xml', name: 'langchain' },
  // ===== Tech News =====
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'tc-ai' },
  { url: 'https://www.theverge.com/ai-artificial-intelligence/rss.xml', name: 'verge-ai' },
  { url: 'https://venturebeat.com/category/ai/feed/', name: 'vb-ai' },
  { url: 'https://www.artificialintelligence-news.com/feed/', name: 'ai-news' },
  { url: 'https://www.marktechpost.com/feed/', name: 'mtp' },
  { url: 'https://www.analyticsvidhya.com/blog/feed/', name: 'av' },
  { url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', name: 'mit-tr-ai' },
  { url: 'https://www.wired.com/feed/tag/ai/latest/rss', name: 'wired-ai' },
  { url: 'https://www.newscientist.com/subject/technology/feed/', name: 'newsci-ai' },
  { url: 'https://www.zdnet.com/topic/artificial-intelligence/rss.xml', name: 'zdnet-ai' },
  { url: 'https://analyticsindiamag.com/feed/', name: 'aim' },
  { url: 'https://www.unite.ai/feed/', name: 'unite-ai' },
  // ===== Developer Community =====
  { url: 'https://dev.to/feed/tag/ai', name: 'devto-ai' },
  { url: 'https://dev.to/feed/tag/machinelearning', name: 'devto-ml' },
  { url: 'https://dev.to/feed/tag/generativeai', name: 'devto-genai' },
  { url: 'https://dev.to/feed/tag/deeplearning', name: 'devto-dl' },
  { url: 'https://dev.to/feed/tag/promptengineering', name: 'devto-pe' },
  { url: 'https://dev.to/feed/tag/llm', name: 'devto-llm' },
  { url: 'https://dev.to/feed/tag/aiagents', name: 'devto-agents' },
  { url: 'https://dev.to/feed/tag/langchain', name: 'devto-langchain' },
  { url: 'https://dev.to/feed/tag/tutorial', name: 'devto-tutorial' },
  { url: 'https://dev.to/feed/tag/writing', name: 'devto-writing' },
  { url: 'https://dev.to/feed/tag/video', name: 'devto-video' },
  { url: 'https://dev.to/feed/tag/contentcreation', name: 'devto-content' },
  { url: 'https://medium.com/feed/tag/artificial-intelligence', name: 'medium-ai' },
  { url: 'https://medium.com/feed/tag/generative-ai', name: 'medium-genai' },
  { url: 'https://medium.com/feed/tag/llm', name: 'medium-llm' },
  { url: 'https://medium.com/feed/tag/ai-agents', name: 'medium-agents' },
  { url: 'https://medium.com/feed/tag/prompt-engineering', name: 'medium-pe' },
  { url: 'https://medium.com/feed/tag/ai-writing', name: 'medium-writing' },
  { url: 'https://medium.com/feed/tag/ai-video', name: 'medium-video' },
  // ===== Academic & Research =====
  { url: 'https://export.arxiv.org/rss/cs.AI', name: 'arxiv-ai' },
  { url: 'https://export.arxiv.org/rss/cs.LG', name: 'arxiv-ml' },
  { url: 'https://export.arxiv.org/rss/cs.CL', name: 'arxiv-nlp' },
  { url: 'https://export.arxiv.org/rss/cs.CV', name: 'arxiv-cv' },
  { url: 'https://paperswithcode.com/research.rss', name: 'pwc' },
  // ===== Community & Discussion =====
  { url: 'https://www.reddit.com/r/artificial/.rss', name: 'reddit-ai' },
  { url: 'https://www.reddit.com/r/MachineLearning/.rss', name: 'reddit-ml' },
  { url: 'https://news.ycombinator.com/rss', name: 'hn' },
  // ===== AI Tools & Product =====
  { url: 'https://www.producthunt.com/feed?category=artificial-intelligence', name: 'ph-ai' },
  { url: 'https://neptune.ai/blog/feed', name: 'neptune' },
  { url: 'https://www.comet.com/blog/feed/', name: 'comet' },
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
// GOOGLE AI HOT TERMS (May 2026)
// ============================================================

const HOT_TERMS = [
  { term: 'AI Agent', weight: 30, slugKeyword: 'ai-agent' },
  { term: 'DeepSeek', weight: 25, slugKeyword: 'deepseek' },
  { term: 'Claude', weight: 20, slugKeyword: 'claude' },
  { term: 'ChatGPT', weight: 20, slugKeyword: 'chatgpt' },
  { term: 'Gemini', weight: 18, slugKeyword: 'gemini' },
  { term: 'Perplexity', weight: 15, slugKeyword: 'perplexity' },
  { term: 'Copilot', weight: 15, slugKeyword: 'copilot' },
  { term: 'Midjourney', weight: 12, slugKeyword: 'midjourney' },
  { term: 'Stable Diffusion', weight: 12, slugKeyword: 'stable-diffusion' },
  { term: 'Multimodal AI', weight: 12, slugKeyword: 'multimodal-ai' },
  { term: 'AI Code Generation', weight: 12, slugKeyword: 'ai-code-generation' },
  { term: 'LLM', weight: 10, slugKeyword: 'llm' },
  { term: 'OpenAI', weight: 10, slugKeyword: 'openai' },
  { term: 'Anthropic', weight: 10, slugKeyword: 'anthropic' },
  { term: 'RAG', weight: 8, slugKeyword: 'rag' },
  { term: 'fine-tuning', weight: 8, slugKeyword: 'fine-tuning' },
  { term: 'vector database', weight: 8, slugKeyword: 'vector-database' },
  { term: 'prompt engineering', weight: 8, slugKeyword: 'prompt-engineering' },
  { term: 'AI video', weight: 8, slugKeyword: 'ai-video' },
  { term: 'AI image', weight: 8, slugKeyword: 'ai-image' },
];

const HOT_TERMS_ONLY = process.env.HOT_TERMS_ONLY === 'true';

// Concurrency: number of pages to scrape simultaneously
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '10', 10);

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
// SEO FUNCTIONS
// ============================================================

function scoreHotTerms(title, content) {
  const titleLower = (title || '').toLowerCase();
  const contentLower = (content || '').toLowerCase();
  let bestScore = 0;
  let bestMatch = null;

  for (const ht of HOT_TERMS) {
    const termLower = ht.term.toLowerCase();
    let score = 0;

    // Title match gets 2x weight
    if (titleLower.includes(termLower)) {
      score += ht.weight * 2;
    }
    // Content match gets 1x weight
    const contentIdx = contentLower.indexOf(termLower);
    if (contentIdx !== -1) {
      score += ht.weight;
      // Bonus: if matched early in content (first 500 chars), extra weight
      if (contentIdx < 500) score += Math.round(ht.weight * 0.5);
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = ht;
    }
  }

  return {
    score: bestScore,
    matchedTerm: bestMatch ? bestMatch.term : null,
    slugKeyword: bestMatch ? bestMatch.slugKeyword : null,
    focusKeyword: bestMatch ? bestMatch.term : null,
  };
}

function extractFocusKeyword(title, content, hotScore) {
  // If hot terms matched, use the highest-scored one
  if (hotScore.focusKeyword) return hotScore.focusKeyword;

  // Else: extract most specific AI noun phrase from title
  const titleStr = (title || '');
  const aiPhrases = [
    /(AI|artificial intelligence)\s+(writing|image|video|code|coding|chat|assistant|tool|agent|model|generator|editor)/i,
    /(best|top|leading)\s+(AI|AI-powered)\s+(\w+\s+)*(tool|app|software|platform|assistant)/i,
    /how to\s+(use|build|create|make|train|deploy|master)\s+(\w+\s+)*?(AI|GPT|LLM|model|agent|bot|automation)/i,
    /(\w+)\s+(vs|versus|alternative|review|comparison)/i,
  ];

  for (const pattern of aiPhrases) {
    const m = titleStr.match(pattern);
    if (m) return m[0].length > 50 ? m[0].substring(0, 50).trim() : m[0].trim();
  }

  // Fallback: use the first 1-3 meaningful words from title that are AI-related
  const aiWords = titleStr.match(/\b(AI|GPT|ChatGPT|Claude|Gemini|LLaMA|Mistral|Copilot|Agent|Neural|Deep|Learning|Model|Bot|Automation)\b/i);
  if (aiWords) return aiWords[1];

  return '';
}

function makeSeoSlug(title, focusKeyword) {
  // Clean the title: lowercase, keep alphanumeric and spaces
  let clean = title.toLowerCase();
  clean = clean.replace(/[^a-z0-9\s-]/g, '');       // remove special chars except spaces and hyphens
  clean = clean.replace(/\s+/g, ' ').trim();          // normalize whitespace

  // Remove common stop words
  const stopWords = /\b(a|an|the|and|or|but|in|on|at|to|for|of|with|by|from|up|about|into|over|after|how|what|why|is|it|its|your|our|their|has|have|been|was|were|all|each|can|will|just|also|very|not|are|be|this|that|new|get|use|using|used)\b/gi;
  clean = clean.replace(stopWords, '');
  clean = clean.replace(/\s+/g, ' ').trim();

  // Convert to slug
  let slug = clean.replace(/\s+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

  if (focusKeyword && slug) {
    const kwSlug = focusKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    // If focus keyword isn't already in the slug, prepend it
    if (!slug.includes(kwSlug)) {
      slug = kwSlug + '-' + slug;
    }
  } else if (!slug) {
    slug = focusKeyword
      ? focusKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
      : 'article-' + Date.now();
  }

  // Truncate to 60 chars (Google truncates longer), removing trailing hyphens
  slug = slug.substring(0, 60).replace(/-+$/g, '');
  return slug || 'article-' + Date.now();
}

function makeSeoDescription(description, content, focusKeyword) {
  let desc = (description || '').trim();

  // If no description, use first 120 chars of content (plain text)
  if (!desc && content) {
    const plain = content.replace(/<[^>]+>/g, '').trim();
    desc = plain.substring(0, 160).replace(/\s+\S*$/, ''); // word-boundary truncate
  }

  // Ensure focus keyword appears in the description
  if (focusKeyword && desc) {
    const kwLower = focusKeyword.toLowerCase();
    const descLower = desc.toLowerCase();
    const kwIdx = descLower.indexOf(kwLower);

    if (kwIdx === -1 || kwIdx > 60) {
      // Prepend keyword if missing or too far in
      desc = focusKeyword + ': ' + desc;
    }
  }

  // Truncate to ~155 chars at word boundary
  if (desc.length > 155) {
    desc = desc.substring(0, 152).replace(/\s+\S*$/, '') + '...';
  }

  return desc.substring(0, 300);
}

// Old makeSlug is replaced by makeSeoSlug above — kept as alias for GitHub README fallback
function makeSlug(title) {
  return makeSeoSlug(title, null);
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

function isAiRelevant(title, description, topics) {
  const titleLower = (title || '').toLowerCase();
  const descLower = (description || '').toLowerCase();
  const allText = titleLower + ' ' + descLower;

  // Check topics if provided (GitHub repos)
  if (topics && Array.isArray(topics)) {
    const topicMatches = topics.some(t => /ai|llm|gpt|chatgpt|claude|gemini|deepseek|mistral|tutorial|machine.learning|deep.learning|neural|agent|nlp|llama|openai|anthropic/i.test(t));
    if (topicMatches) return true;
  }

  // Must have AI keywords in the title or description
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
    // Promotional API / service plugs
    /nsst\s+ai/i,
    /api\.nsstab\.com/i,
  ];
  // Also skip if no AI-related keywords in title or first 500 chars
  const aiKeywords = /ai|artificial.intelligence|machine.learning|deep.learning|llm|gpt|chatgpt|neural|model|automation|data.?science|prompt|agent|bot|nlp|computer.vision|tensorflow|pytorch|algorithm|train|stable.diffusion|midjourney|dalle/i;
  if (!aiKeywords.test(text.substring(0, 500))) {
    return true; // Not clearly AI-related
  }
  return spamPatterns.some(p => p.test(text));
}

/**
 * Detect AI-template-generated content (e.g. [HOOK], [MAIN - TAKEAWAY], [OUTRO] markers)
 */
function isAiTemplateContent(title, content) {
  const fullText = title + ' ' + content;

  // Common AI generation template markers
  const templateMarkers = [
    /\[HOOK\]/i, /\[MAIN\s*[-–]\s*TAKEAWAY\]/i, /\[OUTRO\]/i,
    /\[INTRODUCTION\]/i, /\[CONCLUSION\]/i, /\[KEY TAKEAWAYS?\]/i,
    /\[BODY\]/i, /\[SUMMARY\]/i,
    /Meta\s+Information:/i,
    /"body_markdown":/,
    /"canonical_url":/,
  ];

  let markerCount = 0;
  for (const pattern of templateMarkers) {
    if (pattern.test(fullText)) markerCount++;
  }

  // 2+ template markers = AI-generated template content
  if (markerCount >= 2) return true;

  // Check for structured JSON/metadata blocks suggesting AI batch output
  const hasJsonBlock = /\{[^}]*"nodes"\s*:|\{[^}]*"body_markdown"\s*:/i.test(fullText);
  const hasTemplateSections = /\[HOOK\].*\[MAIN.*TAKEAWAY\].*\[OUTRO\]/is.test(fullText);

  return hasJsonBlock || hasTemplateSections;
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
// VERIFY UPLOADED ARTICLE
// ============================================================

async function verifyArticle(slug, expectedTitle) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?slug=eq.${encodeURIComponent(slug)}&limit=1&select=id,title,slug,description,content,created_at`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      console.log(`  ⚠ VERIFY: Fetch failed (${res.status})`);
      return false;
    }

    const data = await res.json();
    if (!data || data.length === 0) {
      console.log(`  ⚠ VERIFY: Article not found in DB after upload!`);
      return false;
    }

    const article = data[0];
    const issues = [];

    // Check title
    if (!article.title || article.title.length < 5) {
      issues.push('title missing or too short');
    }

    // Check description
    if (!article.description || article.description.length < 10) {
      issues.push('description missing or too short');
    }

    // Check content
    if (!article.content || article.content.length < 200) {
      issues.push('content missing or too short');
    }

    // Check for unclosed HTML tags (common rendering issue)
    const openTags = (article.content || '').match(/<(?!\/|br|hr|img|input|meta|link|!--)([a-z][a-z0-9]*)\b[^>]*>/gi) || [];
    const closeTags = (article.content || '').match(/<\/([a-z][a-z0-9]*)\s*>/gi) || [];
    const tagCounts = {};
    openTags.forEach(t => { const n = t.match(/([a-z][a-z0-9]*)/i)?.[1]; if (n) tagCounts[n] = (tagCounts[n] || 0) + 1; });
    closeTags.forEach(t => { const n = t.match(/\/([a-z][a-z0-9]*)/i)?.[1]; if (n) tagCounts[n] = (tagCounts[n] || 0) - 1; });
    const unbalanced = Object.entries(tagCounts).filter(([_, c]) => c !== 0).map(([t, c]) => `${t}(${c > 0 ? 'unclosed' : 'extra close'})`);
    if (unbalanced.length > 0) {
      issues.push('unbalanced HTML tags: ' + unbalanced.join(', '));
    }

    // Check for garbled content: if plain text has >5% non-ASCII, flag it
    const plainText = (article.content || '').replace(/<[^>]+>/g, '').trim();
    if (plainText.length > 100) {
      const nonAscii = (plainText.match(/[^\x00-\x7F]/g) || []).length;
      if (nonAscii / plainText.length > 0.05) {
        issues.push(`high non-ASCII ratio (${(nonAscii / plainText.length * 100).toFixed(1)}%) — possible garbled content`);
      }
    }

    // Log preview (first 120 chars of plain text)
    const preview = plainText.substring(0, 120).replace(/\s+\S*$/, '');
    console.log(`  ✅ VERIFY: "${article.title?.substring(0, 50)}" — ${article.description?.substring(0, 60)}...`);
    console.log(`    Content preview: ${preview}...`);
    console.log(`    Content length: ${article.content.length} chars | ${plainText.split(/\s+/).length} words`);

    if (issues.length > 0) {
      console.log(`  ⚠ Issues: ${issues.join('; ')}`);
      return false;
    }

    return true;
  } catch (e) {
    console.log(`  ⚠ VERIFY: Error — ${e.message}`);
    return false;
  }
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
  }

  // Process all images concurrently
  const imgArray = [...imgs];
  const results = await Promise.all(imgArray.map(async (el) => {
    const src = $(el).attr('src');
    if (!src) return null;
    const newSrc = await downloadAndUploadImage(src);
    return { el, newSrc, src };
  }));
  for (const r of results) {
    if (r && r.newSrc !== r.src) {
      $(r.el).attr('src', r.newSrc);
      replaced++;
    }
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
    await page.setDefaultTimeout(20000);

    // Block images and fonts for faster loading
    await page.route('**/*.{png,jpg,jpeg,gif,svg,woff,woff2,ttf,eot,css}', route => route.abort());

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

    // Get page content
    const html = await page.content();

    // Load into cheerio
    const cheerio = require('cheerio');
    const $ = cheerio.load(html);

    result.content = cleanContent($);
    result.description = extractDescription($);

    // Clean title: remove site name suffixes like " - DEV Community", " — Medium", " | Hacker News"
    let rawTitle = $('h1').first().text().trim() || $('title').text().trim();
    // Match various title separators:  —  –  -  |  •  ::
    rawTitle = rawTitle.replace(/\s*[–—-](?:\s*.+)?$/i, '').trim();
    rawTitle = rawTitle.replace(/\s*\|\s*.+$/i, '').trim();
    rawTitle = rawTitle.replace(/\s*•\s*.+$/i, '').trim();
    rawTitle = rawTitle.replace(/\s*::\s*.+$/i, '').trim();
    rawTitle = rawTitle.replace(/Enter fullscreen mode.*/i, '').trim();
    rawTitle = rawTitle.replace(/\s{2,}/g, ' ').trim();
    // Keep numbers (dates, versions are SEO-relevant), keep title length reasonable
    if (rawTitle.length > 80) {
      // Try to keep first sentence or first 80 chars
      const sentenceMatch = rawTitle.match(/^[^.!?]*[.!?]/);
      if (sentenceMatch && sentenceMatch[0].length < 80) {
        rawTitle = sentenceMatch[0].trim();
      } else {
        rawTitle = rawTitle.substring(0, 77).trim() + '...';
      }
    }
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
// CONCURRENT SCRAPING
// ============================================================

async function scrapeBatch(candidates, concurrency) {
  const results = new Array(candidates.length);
  let idx = 0;

  const worker = async () => {
    while (idx < candidates.length) {
      const i = idx++;
      const c = candidates[i];
      console.log(`  [${i+1}/${candidates.length}] ${c.title.substring(0, 60)}`);
      const scraped = await scrapeContent(c.url);
      results[i] = { ...c, scraped };
    }
  };

  const workers = Array(Math.min(concurrency, candidates.length)).fill(null).map(() => worker());
  await Promise.all(workers);
  return results;
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
  console.log(`  Hot terms only: ${HOT_TERMS_ONLY}`);
  console.log(`  Concurrency: ${CONCURRENCY}`);
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

  // ============================================================
  // PHASE 1: Collect candidates from RSS feeds
  // ============================================================

  let processed = 0;
  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  const candidates = [];

  // Fetch all RSS feeds concurrently
  const feedResults = await Promise.all(feeds.map(async (feedConfig) => {
    const items = await fetchFeed(feedConfig);
    return { items, feedConfig };
  }));

  for (const { items, feedConfig } of feedResults) {
    if (candidates.length >= MAX_ARTICLES * 2) break;

    for (const item of items) {
      if (candidates.length >= MAX_ARTICLES * 2) break;

      const url = item.link || item.guid;
      if (!url) continue;

      // Dedup check
      if (isAlreadyCrawled(url, crawled)) {
        continue;
      }

      // AI relevance check (pre-scrape filter)
      if (!isAiRelevant(item.title || '', item.contentSnippet || '')) {
        continue;
      }

      // Pre-scrape hot term check (title only, for early filtering)
      const preHotScore = scoreHotTerms(item.title || '', item.contentSnippet || '');
      if (HOT_TERMS_ONLY && preHotScore.score === 0) {
        continue;
      }

      candidates.push({
        url,
        title: (item.title || '').trim(),
        feedConfig,
        item,
      });
    }
  }

  console.log(`\nCandidates collected: ${candidates.length}\n`);

  // ============================================================
  // PHASE 2: Concurrent scraping
  // ============================================================

  console.log(`--- Scraping ${candidates.length} articles (concurrency: ${CONCURRENCY}) ---\n`);

  const scrapedResults = await scrapeBatch(candidates, CONCURRENCY);

  // ============================================================
  // PHASE 3: Post-scrape processing
  // ============================================================

  console.log(`\n--- Post-processing scraped articles ---\n`);

  const articleQueue = [];

  for (const result of scrapedResults) {
    const { url, title, item, feedConfig, scraped } = result;

    if (!scraped || !scraped.content || scraped.content.length < 200) {
      console.log(`  [SKIP] ${title.substring(0, 60)} — content too short`);
      skipped++;
      continue;
    }

    // Language filter
    const contentPlainText = scraped.content.replace(/<[^>]+>/g, '');
    if (!isEnglish(contentPlainText)) {
      console.log(`  [SKIP] ${title.substring(0, 60)} — non-English`);
      skipped++;
      continue;
    }

    // Quality check
    if (!isQualityContent(title, scraped.content)) {
      console.log(`  [SKIP] ${title.substring(0, 60)} — low quality`);
      skipped++;
      continue;
    }

    // Spam filter
    if (isSpam(title, scraped.content)) {
      console.log(`  [SKIP] ${title.substring(0, 60)} — spam`);
      skipped++;
      continue;
    }

    // AI template content filter (e.g. [HOOK], [OUTRO], Meta Information blocks)
    if (isAiTemplateContent(title, scraped.content)) {
      console.log(`  [SKIP] ${title.substring(0, 60)} — AI template content`);
      skipped++;
      continue;
    }

    // Score hot terms
    const hotScore = scoreHotTerms(title, scraped.content);
    if (HOT_TERMS_ONLY && hotScore.score === 0) {
      console.log(`  [SKIP] ${title.substring(0, 60)} — no hot terms`);
      skipped++;
      continue;
    }

    // Process images
    console.log(`  [IMG] ${title.substring(0, 50)}...`);
    const contentHtml = await processImages(scraped.content, url);

    articleQueue.push({
      item,
      scraped,
      contentHtml,
      feedConfig,
      hotScore,
      url,
      title,
      pubDate: extractDate(item),
    });

    processed++;
  }

  console.log(`\nProcessed: ${processed}, Skipped: ${skipped}, Queue: ${articleQueue.length}\n`);

  // ============================================================
  // PHASE 4: Priority sort & upload
  // ============================================================

  // Sort by hot term score descending (highest priority first)
  articleQueue.sort((a, b) => b.hotScore.score - a.hotScore.score);

  console.log(`--- Upload Queue (sorted by hot term priority) ---\n`);

  for (const queued of articleQueue) {
    if (uploaded >= MAX_ARTICLES) break;

    const { item, scraped, contentHtml, feedConfig, hotScore, url, title, pubDate } = queued;

    // Extract focus keyword for SEO
    const focusKeyword = extractFocusKeyword(title, contentHtml, hotScore);

    // SEO-optimized slug
    const slug = makeSeoSlug(title, focusKeyword);

    // SEO-optimized description
    const rawDescription = scraped.description || item.contentSnippet?.substring(0, 200) || '';
    const description = makeSeoDescription(rawDescription, contentHtml, focusKeyword);

    // Category detection
    const categoryId = detectCategory(title, contentHtml);
    const readTime = calcReadTime(contentHtml);

    // Source attribution
    const sourceLine = `<hr><p style="color:#6b7280;font-size:13px;"><em>Source: <a href="${url}" rel="nofollow">${url}</a></em></p>`;
    const fullContent = contentHtml + '\n' + sourceLine;

    // Log SEO info
    const catName = CATEGORIES.find(c => c.id === categoryId)?.name || 'Unknown';
    console.log(`\n[SEO] ${title.substring(0, 70)}`);
    console.log(`  Category: ${catName}`);
    console.log(`  Slug: ${slug} (${slug.length} chars)`);
    console.log(`  Focus keyword: ${focusKeyword || '(none)'}`);
    console.log(`  Hot term score: ${hotScore.score}`);
    console.log(`  Description: ${description.substring(0, 100)}...`);

    // Dedup check: slug exists in DB
    const slugExistsInDb = await slugExists(slug);
    if (slugExistsInDb) {
      console.log(`  [SKIP] Slug already exists in database`);
      crawled.push({ url, title, date: new Date().toISOString() });
      continue;
    }

    if (DRY_RUN) {
      console.log(`  [DRY RUN] Would upload`);
      crawled.push({ url, title, date: new Date().toISOString() });
      uploaded++;
      continue;
    }

    // Build tags with SEO keywords
    const tags = ['ai', 'tutorial'];
    if (focusKeyword) tags.push(focusKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    tags.push(feedConfig.name.replace(/[0-9]/g, ''));
    if (hotScore.matchedTerm && hotScore.matchedTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-') !== focusKeyword?.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
      tags.push(hotScore.matchedTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }

    // Upload
    try {
      const articleData = {
        title,
        slug,
        description: description.substring(0, 300),
        content: fullContent,
        category_id: categoryId,
        tags,
        read_time: readTime,
        rating: 0,
        featured: false,
        published: false,
        created_at: pubDate,
        updated_at: new Date().toISOString(),
      };

      const result = await uploadArticle(articleData);
      const resultId = Array.isArray(result) ? result[0]?.id : result?.id;
      console.log(`  [OK] Saved as draft ID ${resultId || '?'}`);
      // Verify the article was stored correctly
      await verifyArticle(slug, title);
      crawled.push({ url, title, date: new Date().toISOString() });
      uploaded++;
    } catch (e) {
      console.log(`  [ERR] ${e.message}`);
      errors++;
    }

    // Rate limiting delay
    await new Promise(r => setTimeout(r, 1000));
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

        if (!isAiRelevant(repoInfo.name + ' ' + repoInfo.description, repoInfo.description, repoInfo.topics)) {
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

        // Check for AI template content or spam in GitHub READMEs too
        if (isAiTemplateContent(repoInfo.name, readmeHtml)) {
          console.log(`  [SKIP] AI template README`);
          skipped++;
          continue;
        }
        if (isSpam(repoInfo.name, readmeHtml)) {
          console.log(`  [SKIP] Spam README`);
          skipped++;
          continue;
        }

        const title = `${repoInfo.name}: ${repoInfo.description}`;
        const hotScore = scoreHotTerms(title, readmeHtml);
        const focusKeyword = extractFocusKeyword(title, readmeHtml, hotScore);
        const slug = `github-${makeSeoSlug(repoInfo.name, focusKeyword)}`;
        const categoryId = detectCategory(title + ' ' + repoInfo.topics.join(' '), readmeHtml);
        const readTime = calcReadTime(readmeHtml);
        const seoDescription = makeSeoDescription(repoInfo.description, readmeHtml, focusKeyword);

        const sourceLine = `<hr><p style="color:#6b7280;font-size:13px;"><em>Source: <a href="${repoInfo.url}" rel="nofollow">GitHub: ${repoInfo.name}</a> (${repoInfo.stars} stars${repoInfo.topics.length > 0 ? ', ' + repoInfo.topics.join(', ') : ''})</em></p>`;
        const fullContent = readmeHtml + '\n' + sourceLine;

        console.log(`  Category: ${CATEGORIES.find(c => c.id === categoryId)?.name}`);
        console.log(`  Slug: ${slug} (${slug.length} chars)`);
        console.log(`  Focus keyword: ${focusKeyword || '(none)'}`);
        console.log(`  Hot term score: ${hotScore.score}`);

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

        // Build tags with SEO keywords
        const tags = ['ai', 'tutorial', 'github'];
        if (focusKeyword) tags.push(focusKeyword.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
        if (hotScore.matchedTerm && hotScore.matchedTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-') !== focusKeyword?.toLowerCase().replace(/[^a-z0-9]+/g, '-')) {
          tags.push(hotScore.matchedTerm.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
        }
        repoInfo.topics.slice(0, 3).forEach(t => { if (!tags.includes(t)) tags.push(t); });

        try {
          const articleData = {
            title,
            slug,
            description: seoDescription.substring(0, 300),
            content: fullContent,
            category_id: categoryId,
            tags,
            read_time: readTime,
            rating: 0,
            featured: false,
            published: false,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };

          const result = await uploadArticle(articleData);
          const resultId = Array.isArray(result) ? result[0]?.id : result?.id;
          console.log(`  [OK] Saved as draft ID ${resultId || '?'}`);
          // Verify the article was stored correctly
          await verifyArticle(slug, title);
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

/**
 * ============================================================
 *  AI Tools Insider — 每日 SEO 文章生成 & 发布工作流
 * ============================================================
 *  流程:
 *    1. 用 DeepSeek 研究当前 AI 领域搜索热词
 *    2. 生成 10 个高搜索量、低竞争的 AI 教程/评测主题
 *    3. 为每个主题撰写 SEO 优化长文（800+ 词，FAQ 结构化数据）
 *    4. 生成 HTML 文件到 /articles/
 *    5. 更新 index.html（卡片 + 计数）
 *    6. 更新 sitemap.xml
 *    7. 可选: Git commit + Vercel 部署
 * ============================================================
 *  用法:
 *    DEEPSEEK_API_KEY=xxx node generate-articles-workflow.js
 *    DEEPSEEK_API_KEY=xxx node generate-articles-workflow.js --no-deploy
 * ============================================================
 */

const fs = require('fs');
const path = require('path');

// ========== CONFIG ==========
const SITE_URL = 'https://toolrankly.com';
const SITE_NAME = 'AI Tools Insider';
const ARTICLES_DIR = path.join(__dirname, 'articles');
const INDEX_PATH = path.join(__dirname, 'index.html');
const SITEMAP_PATH = path.join(__dirname, 'sitemap.xml');
const API_KEY = process.env.DEEPSEEK_API_KEY;
const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-v4-flash';
const TODAY = new Date().toISOString().split('T')[0];

// How many articles to generate each run
const ARTICLES_PER_RUN = 10;

// ========== EXISTING CONTENT INDEX ==========
// Read existing slugs so the AI doesn't duplicate topics
function loadExistingSlugs() {
  if (!fs.existsSync(ARTICLES_DIR)) return [];
  return fs.readdirSync(ARTICLES_DIR)
    .filter(f => f.endsWith('.html'))
    .map(f => f.replace('.html', ''));
}

// Load existing article titles from index.html for dedup
function loadExistingTitles() {
  if (!fs.existsSync(INDEX_PATH)) return [];
  const html = fs.readFileSync(INDEX_PATH, 'utf-8');
  const titles = [];
  const regex = /<h2><a[^>]*>([^<]+)<\/a><\/h2>/g;
  let m;
  while ((m = regex.exec(html)) !== null) {
    titles.push(m[1]);
  }
  return titles;
}

// ========== DEEPSEEK API ==========
async function callDeepSeek(messages, maxTokens = 8192, temperature = 0.7) {
  if (!API_KEY) {
    console.error('Error: DEEPSEEK_API_KEY environment variable not set');
    console.error('Set it in your environment or GitHub Secrets');
    process.exit(1);
  }
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      temperature,
      max_tokens: maxTokens
    })
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API error (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

function extractJSON(text) {
  let clean = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
  // Try array: find first '[' and track bracket depth
  const arrStart = clean.indexOf('[');
  if (arrStart !== -1) {
    let depth = 0, inStr = false, escape = false;
    for (let i = arrStart; i < clean.length; i++) {
      const ch = clean[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"') inStr = !inStr;
      if (!inStr) {
        if (ch === '[') depth++;
        else if (ch === ']') { depth--; if (depth === 0) return JSON.parse(clean.slice(arrStart, i + 1)); }
      }
    }
  }
  // Try object: find first '{' and track brace depth
  const objStart = clean.indexOf('{');
  if (objStart !== -1) {
    let depth = 0, inStr = false, escape = false;
    for (let i = objStart; i < clean.length; i++) {
      const ch = clean[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inStr) { escape = true; continue; }
      if (ch === '"') inStr = !inStr;
      if (!inStr) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; if (depth === 0) return JSON.parse(clean.slice(objStart, i + 1)); }
      }
    }
  }
  throw new Error('No valid JSON found in response');
}

// ========== STEP 1: RESEARCH TRENDING TOPICS ==========
async function researchTrendingTopics(existingSlugs, existingTitles) {
  console.log('\n====== [1/4] RESEARCHING TRENDING AI TOPICS ======\n');

  const prompt = `You are an SEO content strategist for ${SITE_NAME}, a site about AI tools and tutorials.

Today's date: ${TODAY}

TASK: Research and generate ${ARTICLES_PER_RUN} article topics that real people are searching for RIGHT NOW in the AI space.

For each topic, think about:
1. **Search intent** — Is the user looking for a tutorial ("how to"), a comparison ("vs"), a review ("best"), or a guide?
2. **Search volume potential** — Would a significant number of people search for this monthly?
3. **Low competition angle** — Can we target a specific subtopic or angle that big sites aren't covering well?
4. **Timeliness** — Is this relevant to current AI news, tool releases, or industry shifts?

Each topic must be a JSON object:
{
  "slug": "url-friendly-seo-slug-50-60-chars",
  "title": "SEO headline (50-70 characters, include primary keyword near the beginning)",
  "desc": "Meta description (120-155 characters, include primary keyword, include a benefit or hook)",
  "category": "Guide | Review | Comparison | Tutorial",
  "tag": "guide | review | comparison",
  "readTime": "X min",
  "primaryKeyword": "main-target-keyword",
  "secondaryKeywords": ["related-keyword-1", "related-keyword-2", "related-keyword-3"]
}

CATEGORY RULES:
- "Tutorial": Step-by-step how-to articles (how to use tool X, how to do Y with AI). Tag: "guide"
- "Guide": Comprehensive overviews, best-of lists, beginner guides. Tag: "guide"
- "Review": In-depth single-tool review or feature analysis. Tag: "review"
- "Comparison": Head-to-head tool comparisons. Tag: "comparison"

TOPIC IDEAS (use these as inspiration, not as literal topics):
- How-to tutorials for specific AI tools (new features, workflows)
- Comparisons of new model releases
- Best AI tools for specific use cases (students, developers, designers, etc.)
- Prompt engineering techniques
- AI workflow automation
- AI for specific industries
- New AI model releases and benchmarks
- Cost comparisons of AI subscriptions

REQUIREMENTS:
- Slugs must NOT match any of these existing slugs: ${existingSlugs.join(', ')}
- Titles must NOT match any of these existing titles: ${existingTitles.join(', ')}
- ${ARTICLES_PER_RUN} unique topics
- Cover a MIX of categories (some tutorials, some guides, some comparisons)
- Focus on HIGH-VALUE topics that can rank well

Return ONLY a valid JSON array of ${ARTICLES_PER_RUN} objects, no other text.`;

  const result = await callDeepSeek([
    { role: 'system', content: 'You are a JSON-only API. Return ONLY valid JSON arrays. No markdown, no explanation.' },
    { role: 'user', content: prompt }
  ], 4096, 0.3);

  const topics = extractJSON(result);

  if (!Array.isArray(topics) || topics.length < ARTICLES_PER_RUN) {
    throw new Error(`Expected ${ARTICLES_PER_RUN} topics, got ${topics?.length}`);
  }

  // Validate slugs don't conflict
  for (const t of topics) {
    if (existingSlugs.includes(t.slug)) {
      t.slug = t.slug + '-' + TODAY.replace(/-/g, '');
    }
  }

  console.log(`  ✓ Generated ${topics.length} trending topics:\n`);
  topics.forEach((t, i) => {
    console.log(`  ${i + 1}. ${t.title}`);
    console.log(`     📝 ${t.desc}`);
    console.log(`     🏷  ${t.category} | ⏱ ${t.readTime} | 🔑 ${t.primaryKeyword}`);
    console.log();
  });

  return topics;
}

// ========== STEP 2: WRITE FULL ARTICLE ==========
async function writeArticle(topic, existingSlugs) {
  console.log(`  [Writing] "${topic.title}"...`);

  const prompt = `You are writing a professional, SEO-optimized article for ${SITE_NAME} (${SITE_URL}). Your writing style: authoritative but approachable, specific with facts and numbers, helpful without being salesy.

Write a complete, in-depth article with these specifications:

TITLE: ${topic.title}
DESCRIPTION: ${topic.desc}
CATEGORY: ${topic.category}
PRIMARY KEYWORD: ${topic.primaryKeyword}
SECONDARY KEYWORDS: ${topic.secondaryKeywords.join(', ')}

Generate a JSON object with this structure:
{
  "sections": [
    {
      "h2": "SEO-optimized heading (include primary or secondary keyword naturally)",
      "p": "2-4 informative paragraphs. Include specific details: tool names, version numbers, prices ($), features, real use cases, comparisons. 60-120 words total. Write in natural, fluent English."
    }
  ],
  "faq": [
    {
      "q": "A common question people ask about this topic",
      "a": "A detailed, helpful answer (30-50 words)"
    }
  ],
  "related": ["slug-1", "slug-2"]
}

CONTENT STRUCTURE RULES (7-8 sections total):
1. Section 1: Introduction — hook the reader, explain why this matters NOW, preview what they'll learn (h2: "Why [Topic] Matters in 2026")
2. Sections 2-5: Main content — deep dive into the topic with specific details, examples, data
3. Section 6: Pros & Cons OR Comparison Table OR Step-by-Step Guide (depending on category)
4. Section 7: Best Practices or Tips section
5. Section 8: Conclusion — summarize key takeaways, give a clear recommendation

FAQ RULES:
- Write 3-4 real questions people search for
- Each answer must be informative (30-50 words)
- Cover different aspects of the topic

RELATED ARTICLES:
- Pick 2-3 slugs from: ${existingSlugs.join(', ')}
- Choose articles that are genuinely relevant to this topic
- Return the slug names WITHOUT .html extension

QUALITY REQUIREMENTS:
- Each paragraph must be 2-4 sentences of substantive content
- Include specific, factual information (prices, features, version numbers)
- Write naturally — no AI-sounding fluff or generic statements
- Vary sentence length for readability
- Use transition phrases between paragraphs
- NO markdown or formatting symbols in the text
- Return ONLY valid JSON, no other text

EXAMPLES OF GOOD SECTIONS:
For a Comparison article:
  {"h2": "ChatGPT vs Claude: Head-to-Head Feature Comparison", "p": "When comparing ChatGPT and Claude for daily productivity, several key differences emerge. ChatGPT offers GPT-5.5 with a 128K token context window and costs $20/month for Plus. Claude 4.7 provides a 200K token context window at the same price point but excels at longer documents and coding tasks. For most users, the choice comes down to whether you need broader general knowledge (ChatGPT) or deeper analytical capabilities (Claude)..."}

For a Tutorial article:
  {"h2": "Step 1: Setting Up Your First Automation", "p": "Begin by creating a free account on Make.com and connecting your primary tools. Start with a simple scenario: when a new email arrives in Gmail with a specific label, automatically create a task in Notion. This basic workflow takes about 5 minutes to set up and introduces you to the core concepts of triggers, actions, and data mapping..."}

For a Guide article:
  {"h2": "Top 5 AI Coding Assistants Compared", "p": "After testing 15 different AI coding tools over three months, five stand out from the rest. GitHub Copilot leads with 55% market share and costs $10/month for individuals. Cursor AI offers a unique editor-integrated experience at $20/month. Amazon CodeWhisperer remains free for individual developers. Each tool excels in different scenarios, and the best choice depends on your tech stack and workflow preferences..."}`;

  const result = await callDeepSeek([
    { role: 'system', content: 'You are a professional tech journalist. Return ONLY valid JSON objects. No markdown, no explanation.' },
    { role: 'user', content: prompt }
  ], 8192, 0.5);

  let data;
  try {
    data = extractJSON(result);
  } catch (parseErr) {
    console.log(`  ⚠ JSON parse failed. Raw response start: ${result.slice(0, 200).replace(/\n/g, '\\n')}`);
    const alt = result.replace(/^[^{[]*/m, '').replace(/[^}\]]*$/m, '');
    try { data = extractJSON(alt); } catch { throw parseErr; }
  }
  if (!data || !data.sections) {
    // DeepSeek sometimes returns an array [{h2, p}, ...] instead of {sections: [{h2, p}, ...]}
    if (Array.isArray(data) && data.length > 0 && data[0].h2 && data[0].p) {
      data = { sections: data, faq: [], related: [] };
    } else {
      const keys = data ? Object.keys(data).join(', ') : 'null';
      const preview = JSON.stringify(data).slice(0, 300);
      throw new Error(`Invalid structure. Keys: [${keys}]. Preview: ${preview}`);
    }
  }

  // Validate sections
  if (!data.sections || data.sections.length < 5) {
    throw new Error(`Only ${data.sections?.length} sections generated, need at least 5`);
  }

  // Ensure related are .html suffixed
  const related = (data.related || [])
    .filter(Boolean)
    .map(r => r.endsWith('.html') ? r : r + '.html');

  // Build FAQ schema JSON-LD (only if FAQ exists)
  const faqItems = data.faq || [];
  const faqSchema = faqItems.length > 0 ? `
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "mainEntity": [${data.faq.map(f => `{
      "@type": "Question",
      "name": ${JSON.stringify(f.q)},
      "acceptedAnswer": {
        "@type": "Answer",
        "text": ${JSON.stringify(f.a)}
      }
    }`).join(',\n')}]
  }
  </script>` : '';

  // Build FAQ HTML section if faq exists
  const faqHTML = faqItems.length > 0 ? `
          <h2 id="frequently-asked-questions">Frequently Asked Questions</h2>${faqItems.map(f => `
          <div class="faq-item">
            <h3>${f.q}</h3>
            <p>${f.a}</p>
          </div>`).join('')}
          <div class="ad-container ad-container--in-content">
            <div class="ad-label">Advertisement</div>
          </div>` : '';

  return { sections: data.sections, related, faqSchema, faqHTML };
}

// ========== HTML TEMPLATE (matches current site design) ==========
function buildArticleHTML(a, faqSchema) {
  const tagClass = a.tag || a.category.toLowerCase();
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${a.title}</title>
  <meta name="description" content="${a.desc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="${SITE_URL}/articles/${a.slug}.html">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${a.title}">
  <meta property="og:description" content="${a.desc}">
  <meta property="og:url" content="${SITE_URL}/articles/${a.slug}.html">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${a.title}">
  <meta name="twitter:description" content="${a.desc}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": ${JSON.stringify(a.title)},
    "description": ${JSON.stringify(a.desc)},
    "author": { "@type": "Organization", "name": "${SITE_NAME}" },
    "datePublished": "${a.date}",
    "dateModified": "${a.date}",
    "publisher": { "@type": "Organization", "name": "${SITE_NAME}" }
  }
  </script>${faqSchema}
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <meta name="google-site-verification" content="r4pFlorufSq6sd0fLjcuxarji5jBk8XcaBzNj2oQvjk">
  <meta name="google-adsense-account" content="ca-pub-8856252621654174">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8856252621654174" crossorigin="anonymous"></script>
</head>
<body>
<div class="progress-bar" id="progressBar"></div>
<header class="header">
  <div class="header-inner">
    <a href="/" class="logo">${SITE_NAME}</a>
    <nav>
      <ul class="nav">
        <li><a href="/">Home</a></li>
        <li><a href="/articles/best-ai-writing-tools-2026.html">Writing</a></li>
        <li><a href="/articles/best-ai-image-generators-2026.html">Image</a></li>
        <li><a href="/articles/best-ai-coding-tools-2026.html">Coding</a></li>
        <li><a href="/articles/ai-video-generators-2026-comparison.html">Video</a></li>
        <li><a href="/articles/chatgpt-vs-gemini-2026.html">Comparisons</a></li>
      </ul>
    </nav>
    <button class="nav-toggle" aria-label="Menu">☰</button>
  </div>
</header>
<main class="article-page">
  <div class="container">
    <div class="breadcrumbs">
      <a href="/">Home</a>
      <span class="sep">/</span>
      <a href="/">Articles</a>
      <span class="sep">/</span>
      <span class="current">${a.title}</span>
    </div>
    <article>
      <header class="article-header">
        <span class="tag tag--${tagClass}">${a.category}</span>
        <h1>${a.title}</h1>
        <p style="font-size:16px;color:var(--text-secondary);margin:8px 0 0;line-height:1.6;">${a.desc}</p>
        <div class="article-meta" style="margin-top:16px;">${a.date} <span class="dot"></span> ${a.readTime} read</div>
      </header>
<div class="content-with-sidebar">
        <div class="article-body">
${a.sections.map((s, i) => {
  const id = s.h2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let html = `          <h2 id="${id}">${s.h2}</h2>\n          <p>${s.p}</p>`;
  if ((i + 1) % 2 === 0) {
    html += `\n          <div class="ad-container ad-container--in-content">
            <div class="ad-label">Advertisement</div>
          </div>`;
  }
  return html;
}).join('\n')}
          ${a.faqHTML || ''}
          <div class="ad-container ad-container--footer">
            <div class="ad-label">Advertisement</div>
          </div>
        </div>
        <aside class="sidebar">
          <div class="sidebar-section">
            <h3>Table of Contents</h3>
            <ul class="sidebar-links">
${a.sections.map(s => {
  const id = s.h2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  return `              <li><a href="#${id}">${s.h2}</a></li>`;
}).join('\n')}
            </ul>
          </div>
          <div class="ad-container ad-container--sidebar">
            <div class="ad-label">Advertisement</div>
          </div>
          <div class="sidebar-section">
            <h3>Related Articles</h3>
            <ul class="sidebar-links">
${a.related.map(r => {
  const label = r.replace(/\.html$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `              <li><a href="/articles/${r}">${label}</a></li>`;
}).join('\n')}
            </ul>
          </div>
        </aside>
      </div>
    </article>
    <div class="related-section">
      <h2>More Articles You Might Like</h2>
      <div class="related-grid">
${a.related.map(r => {
  const label = r.replace(/\.html$/, '').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return `        <div class="related-card">
          <h3><a href="/articles/${r}">${label}</a></h3>
        </div>`;
}).join('\n')}
      </div>
    </div>
  </div>
</main>
<footer class="footer">
  <div class="footer-inner">
    <div class="footer-brand">
      <h3>${SITE_NAME}</h3>
      <p>Honest, in-depth reviews and comparisons of the best AI tools.</p>
    </div>
    <div class="footer-links">
      <h4>Reviews</h4>
      <ul>
        <li><a href="/articles/best-ai-writing-tools-2026.html">AI Writing Tools</a></li>
        <li><a href="/articles/best-ai-image-generators-2026.html">AI Image Generators</a></li>
        <li><a href="/articles/best-ai-coding-tools-2026.html">AI Coding Tools</a></li>
        <li><a href="/articles/ai-video-generators-2026-comparison.html">AI Video Generators</a></li>
        <li><a href="/articles/ai-voice-generators-text-to-speech-2026.html">AI Voice Generators</a></li>
      </ul>
    </div>
    <div class="footer-links">
      <h4>Company</h4>
      <ul>
        <li><a href="/about.html">About</a></li>
        <li><a href="/contact.html">Contact</a></li>
        <li><a href="/privacy.html">Privacy Policy</a></li>
      </ul>
    </div>
  </div>
  <div class="footer-bottom">
    <p>&copy; 2026 ${SITE_NAME}. All rights reserved.</p>
  </div>
</footer>
<button class="scroll-top" aria-label="Scroll to top">↑</button>
<script src="/js/script.js"></script>
</body>
</html>`;
}

// ========== CARD HTML (for index.html) ==========
function cardHTML(a) {
  const tagClass = a.tag || a.category.toLowerCase();
  return `      <article class="post-card" data-tag="${tagClass}" data-topics="${a.topics || ''}">
        <div class="post-meta">
          <span class="tag tag--${tagClass}">${a.category}</span>
          <span>${formatDate(a.date)}</span>
        </div>
        <h2><a href="/articles/${a.slug}.html">${a.title}</a></h2>
        <p class="post-excerpt">${a.desc}</p>
        <div class="post-footer">
          <span class="read-time">${a.readTime} read</span>
          <a href="/articles/${a.slug}.html">Read →</a>
        </div>
      </article>`;
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// ========== STEP 3: UPDATE INDEX.HTML ==========
function updateIndexHTML(newArticles) {
  console.log('\n====== [3/4] UPDATING INDEX.HTML ======');
  if (!fs.existsSync(INDEX_PATH)) {
    console.error('  ERROR: index.html not found. Run from project root.');
    process.exit(1);
  }

  let indexHtml = fs.readFileSync(INDEX_PATH, 'utf-8');
  const newCards = newArticles.map(a => cardHTML(a)).join('\n\n');

  // Insert new cards at the top of the grid
  const gridOpen = '<div class="posts-grid" id="postsGrid">';
  const gridStart = indexHtml.indexOf(gridOpen);
  if (gridStart === -1) {
    console.error('  ERROR: Could not find posts-grid in index.html');
    process.exit(1);
  }
  const insertPos = gridStart + gridOpen.length;
  indexHtml = indexHtml.slice(0, insertPos) + '\n\n' + newCards + '\n\n' + indexHtml.slice(insertPos);

  // Update article count
  const countMatch = indexHtml.match(/<span class="count">(\d+) articles?<\/span>/);
  if (countMatch) {
    const oldCount = parseInt(countMatch[1]);
    const newCount = oldCount + newArticles.length;
    indexHtml = indexHtml.replace(countMatch[0], `<span class="count">${newCount} articles</span>`);
    console.log(`  ✓ Count: ${oldCount} → ${newCount} articles`);
  }

  fs.writeFileSync(INDEX_PATH, indexHtml, 'utf-8');
  console.log(`  ✓ Added ${newArticles.length} new card(s) to index.html`);
}

// ========== STEP 4: UPDATE SITEMAP ==========
function updateSitemap(newArticles) {
  console.log('\n====== [4/4] UPDATING SITEMAP.XML ======');
  if (!fs.existsSync(SITEMAP_PATH)) {
    console.error('  ERROR: sitemap.xml not found.');
    process.exit(1);
  }

  let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf-8');
  const today = TODAY;

  const newUrlBlocks = newArticles.map(a => `  <url>
    <loc>${SITE_URL}/articles/${a.slug}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${a.category === 'Guide' ? '0.7' : a.category === 'Review' ? '0.8' : '0.7'}</priority>
  </url>`).join('\n');

  sitemap = sitemap.replace('</urlset>', newUrlBlocks + '\n</urlset>');
  // Update homepage lastmod
  sitemap = sitemap.replace(/(<lastmod>)\d{4}-\d{2}-\d{2}(<\/lastmod>)/, `$1${today}$2`);

  fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf-8');
  console.log(`  ✓ Added ${newArticles.length} URL(s) to sitemap`);
}

// ========== STEP 5: GIT + VERCEL DEPLOY ==========
async function deploy(newArticles) {
  console.log('\n====== DEPLOYING ======');
  const { execSync } = require('child_process');
  try {
    execSync(`cd "${__dirname}" && git add -A`, { stdio: 'pipe' });
    execSync(`cd "${__dirname}" && git commit -m "daily: ${newArticles.length} SEO-optimized AI tutorials (${TODAY})"`, { stdio: 'pipe' });
    console.log('  ✓ Git commit');

    try {
      execSync(`cd "${__dirname}" && git push origin main`, { stdio: 'pipe', timeout: 120000 });
      console.log('  ✓ Git push to origin/main');
    } catch (e) {
      console.log(`  ⚠ Git push failed (network issue): ${e.message}`);
    }

    try {
      execSync(`cd "${__dirname}" && npx vercel --prod --yes`, { stdio: 'pipe', timeout: 120000 });
      console.log('  ✓ Vercel deploy successful');
    } catch (e) {
      console.log(`  ⚠ Vercel deploy failed: ${e.message}`);
    }
  } catch (e) {
    console.log(`  ⚠ Deploy error: ${e.message}`);
  }
}

// ========== MAIN ==========
async function main() {
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║   AI Tools Insider — Daily Article Generator    ║');
  console.log(`║   ${TODAY}                    ║`);
  console.log('╚══════════════════════════════════════════════════╝');

  const startTime = Date.now();

  // Ensure articles directory exists
  if (!fs.existsSync(ARTICLES_DIR)) {
    fs.mkdirSync(ARTICLES_DIR, { recursive: true });
  }

  const existingSlugs = loadExistingSlugs();
  const existingTitles = loadExistingTitles();
  console.log(`Existing articles: ${existingSlugs.length}, Existing titles: ${existingTitles.length}`);

  // ---- STEP 1: Research ----
  const topics = await researchTrendingTopics(existingSlugs, existingTitles);

  // ---- STEP 2: Write articles ----
  console.log('====== [2/4] WRITING ARTICLES ======\n');
  const newArticles = [];
  let success = 0;
  let failed = 0;

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    try {
      const content = await writeArticle(t, existingSlugs);

      // Check content quality
      const totalWords = content.sections.reduce((sum, s) => sum + s.p.split(/\s+/).length, 0);
      if (totalWords < 250) {
        console.log(`  ⚠  Only ${totalWords} words — below 250 minimum, retrying...`);
        // Second attempt with higher temperature for more creative output
        const retryContent = await writeArticle(t, existingSlugs);
        const retryWords = retryContent.sections.reduce((sum, s) => sum + s.p.split(/\s+/).length, 0);
        if (retryWords < 250) {
          throw new Error(`Content too short: ${retryWords} words`);
        }
        content.sections = retryContent.sections;
        content.related = retryContent.related;
        content.faqSchema = retryContent.faqSchema;
        content.faqHTML = retryContent.faqHTML;
      }

      const article = {
        slug: t.slug,
        title: t.title,
        desc: t.desc,
        category: t.category,
        tag: t.tag || t.category.toLowerCase(),
        readTime: t.readTime,
        date: TODAY,
        topics: t.secondaryKeywords ? t.secondaryKeywords.slice(0, 3).join(', ') : '',
        sections: content.sections,
        related: content.related,
        faqSchema: content.faqSchema || '',
        faqHTML: content.faqHTML || ''
      };

      // Generate HTML
      const html = buildArticleHTML(article, article.faqSchema);
      const fp = path.join(ARTICLES_DIR, t.slug + '.html');
      fs.writeFileSync(fp, html, 'utf-8');

      newArticles.push(article);
      existingSlugs.push(t.slug);
      success++;

      const wordCount = content.sections.reduce((sum, s) => sum + s.p.split(/\s+/).length, 0);
      const sectionCount = content.sections.length;
      const faqCount = (content.faqHTML.match(/<h3>/g) || []).length;
      console.log(`  ✓ ${i + 1}/${topics.length} "${t.slug}.html" (${wordCount} words, ${sectionCount} sections, ${faqCount} FAQ)`);
    } catch (err) {
      failed++;
      console.error(`  ✗ ${i + 1}/${topics.length} "${t.title}" FAILED: ${err.message}`);
    }

    // Delay between articles to avoid rate limiting
    if (i < topics.length - 1) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  console.log(`\nResults: ${success} success, ${failed} failed`);

  if (newArticles.length === 0) {
    console.log('\n✗ No articles generated. Aborting.');
    process.exit(1);
  }

  // ---- STEP 3: Update index.html ----
  updateIndexHTML(newArticles);

  // ---- STEP 4: Update sitemap ----
  updateSitemap(newArticles);

  // ---- STEP 5: Deploy (optional) ----
  const doDeploy = !process.argv.includes('--no-deploy');
  if (doDeploy) {
    await deploy(newArticles);
  } else {
    console.log('\n====== DEPLOY SKIPPED (--no-deploy) ======');
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
  console.log(`\n✓ Done! Published ${newArticles.length} articles in ${elapsed} min`);
  console.log('  Remember to check:');
  console.log('  - Articles generated without errors');
  console.log('  - index.html cards are properly formatted');
  console.log('  - sitemap.xml includes new URLs');
  console.log('  - Google Search Console for indexing status\n');
}

main().catch(err => {
  console.error('\n✗ Fatal error:', err);
  process.exit(1);
});

const fs = require('fs');
const path = require('path');

const API_KEY = process.env.DEEPSEEK_API_KEY;
if (!API_KEY) {
  console.error('Error: DEEPSEEK_API_KEY environment variable not set');
  console.error('Set it in GitHub Secrets as DEEPSEEK_API_KEY');
  process.exit(1);
}

const API_URL = 'https://api.deepseek.com/v1/chat/completions';
const MODEL = 'deepseek-chat';
const TODAY = new Date().toISOString().split('T')[0];

async function callDeepSeek(messages, maxTokens = 4096, temperature = 0.7) {
  const resp = await fetch(API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({ model: MODEL, messages, temperature, max_tokens: maxTokens })
  });
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`API error (${resp.status}): ${err}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

const template = (a) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${a.title}</title>
  <meta name="description" content="${a.desc}">
  <meta name="robots" content="index, follow">
  <link rel="canonical" href="https://toolrankly.com/articles/${a.slug}.html">
  <meta property="og:type" content="article">
  <meta property="og:title" content="${a.title}">
  <meta property="og:description" content="${a.desc}">
  <meta property="og:url" content="https://toolrankly.com/articles/${a.slug}.html">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${a.title}">
  <meta name="twitter:description" content="${a.desc}">
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "${a.title.replace(/"/g, '\\"')}",
    "description": "${a.desc.replace(/"/g, '\\"')}",
    "author": { "@type": "Organization", "name": "AI Tools Insider" },
    "datePublished": "${a.date}",
    "dateModified": "${a.date}",
    "publisher": { "@type": "Organization", "name": "AI Tools Insider" }
  }
  </script>
  <link rel="stylesheet" href="/css/style.css">
  <meta name="google-adsense-account" content="ca-pub-8856252621654174">
  <script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8856252621654174" crossorigin="anonymous"></script>
</head>
<body>
<header class="site-header">
  <div class="header-inner">
    <a href="/" class="site-logo">AI<span>Tools</span>Insider</a>
    <button class="nav-toggle" aria-label="Toggle navigation">☰</button>
    <nav>
      <ul class="nav-links">
        <li><a href="/">Home</a></li>
        <li><a href="/articles/best-ai-writing-tools-2026.html">Writing</a></li>
        <li><a href="/articles/best-ai-image-generators-2026.html">Image</a></li>
        <li><a href="/articles/best-ai-coding-tools-2026.html">Coding</a></li>
        <li><a href="/articles/chatgpt-vs-gemini-2026.html">Comparisons</a></li>
        <li><a href="/about.html">About</a></li>
      </ul>
    </nav>
  </div>
</header>
<main class="article-page">
  <div class="container">
    <article>
      <header class="article-header">
        <span class="article-category">${a.category}</span>
        <h1>${a.title}</h1>
        <div class="article-meta">Updated: ${a.date} &middot; ${a.readTime}</div>
      </header>
      <div class="ad-container ad-container--leaderboard">
        <div class="ad-label">Advertisement</div>
        <div class="ad-placeholder" style="height:90px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;color:#9ca3af;">Ad Unit (728x90)</div>
      </div>
      <div class="content-with-sidebar">
        <div class="article-body">
${a.sections.map((s, i) => {
  const id = s.h2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  let html = `          <h2 id="${id}">${s.h2}</h2>\n          <p>${s.p}</p>`;
  if ((i + 1) % 2 === 0) {
    html += `\n          <div class="ad-container ad-container--in-content">
            <div class="ad-label">Advertisement</div>
            <div class="ad-placeholder" style="height:250px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;color:#9ca3af;">Ad Unit (728x250)</div>
          </div>`;
  }
  return html;
}).join('\n')}
          <div class="ad-container ad-container--footer">
            <div class="ad-label">Advertisement</div>
            <div class="ad-placeholder" style="height:90px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;color:#9ca3af;">Ad Unit (728x90)</div>
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
            <div class="ad-placeholder" style="height:600px;display:flex;align-items:center;justify-content:center;background:#f3f4f6;border:2px dashed #d1d5db;border-radius:8px;color:#9ca3af;">Ad Unit (300x600)</div>
          </div>
          <div class="sidebar-section">
            <h3>Related Articles</h3>
            <ul class="sidebar-links">
${a.related.map(r => {
  const label = r.replace(/-/g, ' ').replace('.html', '').replace(/\b\w/g, c => c.toUpperCase());
  return `              <li><a href="/articles/${r}">${label}</a></li>`;
}).join('\n')}
            </ul>
          </div>
        </aside>
      </div>
    </article>
  </div>
</main>
<footer class="site-footer">
  <div class="footer-inner">
    <div class="footer-grid">
      <div class="footer-brand">
        <h3>AI Tools Insider</h3>
        <p>Honest, in-depth reviews and comparisons of the best AI tools.</p>
      </div>
      <div class="footer-links">
        <h4>Quick Links</h4>
        <ul>
          <li><a href="/">Home</a></li>
          <li><a href="/about.html">About</a></li>
          <li><a href="/privacy.html">Privacy Policy</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <p>&copy; 2026 AI Tools Insider. All rights reserved.</p>
    </div>
  </div>
</footer>
<button class="scroll-top" aria-label="Scroll to top">&uarr;</button>
<script src="/js/script.js"></script>
</body>
</html>`;

const existingSlugs = [
  'ai-agents-2026-beginners-guide', 'gpt-5-5-vs-claude-opus-4-7', 'best-ai-coding-tools-2026',
  'what-is-mcp-model-context-protocol', 'ai-video-generators-2026-comparison', 'deepseek-v4-review',
  'best-ai-image-enhancers-2026', 'ai-personal-finance-tools-2026', 'prompt-engineering-guide-2026',
  'ai-voice-generators-text-to-speech-2026', 'chatgpt-vs-gemini-2026', 'best-ai-writing-tools-2026',
  'best-ai-image-generators-2026'
];

async function main() {
  console.log(`=== AI Article Generator (${TODAY}) ===\n`);

  // Step 1: Generate 10 article topics
  console.log('[1/11] Generating 10 trending AI article topics...');
  const topicPrompt = `You are a tech news editor for AI Tools Insider. Generate 10 unique, trending AI article topics for ${TODAY}.

Each topic must be a JSON object with:
{
  "slug": "url-friendly-id-with-hyphens",
  "title": "SEO headline (50-70 chars)",
  "desc": "Meta description (120-155 chars)",
  "category": "Guide | Review | Comparison",
  "readTime": "X min"
}

Rules:
- Topics must be about CURRENT AI trends: new model releases, industry news, tool comparisons, practical guides
- SLUGS must be unique and not match any of these existing slugs: ${existingSlugs.join(', ')}
- Titles must be different from any existing article
- Focus on what people are searching for RIGHT NOW in ${TODAY}

Return ONLY a valid JSON array of 10 objects, no other text.`;

  let topics;
  try {
    const topicResult = await callDeepSeek([
      { role: 'system', content: 'You are a JSON-only API. Return ONLY valid JSON arrays, no markdown, no explanation.' },
      { role: 'user', content: topicPrompt }
    ], 4096, 0.3);

    const clean = topicResult.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    topics = JSON.parse(match ? match[0] : clean);

    if (!Array.isArray(topics) || topics.length < 10) {
      throw new Error(`Expected 10 topics, got ${topics?.length}`);
    }
    console.log(`  Generated ${topics.length} topics successfully\n`);
  } catch (err) {
    console.error('  Failed to generate topics:', err.message);
    process.exit(1);
  }

  // Step 2: Generate full content for each topic
  const outDir = path.join(__dirname, 'articles');
  let success = 0;
  let failed = 0;

  for (let i = 0; i < topics.length; i++) {
    const t = topics[i];
    console.log(`[${i + 2}/11] Writing: "${t.title}"...`);

    try {
      const contentPrompt = `You are writing for AI Tools Insider (toolrankly.com), a site that publishes honest, in-depth AI tool reviews.

Write a complete article with these details:
- Title: ${t.title}
- Description: ${t.desc}
- Category: ${t.category}
- Reading time: ${t.readTime}

Generate a JSON object with:
{
  "sections": [
    {
      "h2": "Section Heading (6-10 words)",
      "p": "2-3 informative paragraphs about this topic. Include specific tool names, features, prices, and comparisons where relevant. Write 40-80 words total. Be factual and helpful, like a real tech reviewer."
    }
  ],
  "related": ["pick 2-3 related slugs from this list: ${existingSlugs.join(', ')}"]
}

Requirements for the article:
- 5-6 sections total (h2 + paragraph each)
- Section 1 must be an introduction to the topic (h2: "Why [Topic] Matters in [Year]" or similar)
- Include specific product names, versions, prices, and real details
- Write in natural English, like a human expert
- Each paragraph should be 2-3 sentences
- NO markdown, NO formatting symbols in the text
- Return ONLY valid JSON, no other text

Good section examples:
- "ChatGPT vs Claude for Long-Form Writing" → compare features, quality, pricing
- "Top 5 Tools for [Category]" → list with details for each
- "How to Choose the Right [Tool]" → decision framework
- "Pricing Compared" → break down costs
- "Final Verdict" → clear recommendation`;

      const content = await callDeepSeek([
        { role: 'system', content: 'You are a professional tech journalist. Return ONLY valid JSON objects, no other text.' },
        { role: 'user', content: contentPrompt }
      ], 4096, 0.7);

      const cleanContent = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      const articleData = JSON.parse(jsonMatch ? jsonMatch[0] : cleanContent);

      // Ensure related is array of strings with .html extension
      const related = (articleData.related || []).map(r => r.endsWith('.html') ? r : r + '.html');

      const article = {
        ...t,
        date: TODAY,
        sections: articleData.sections.slice(0, 6),
        related
      };

      const html = template(article);
      const fp = path.join(outDir, t.slug + '.html');
      fs.writeFileSync(fp, html, 'utf-8');
      success++;
      console.log(`  [OK] Created: ${t.slug}.html`);
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${t.title}: ${err.message}`);
    }

    // Small delay to avoid rate limits
    if (i < topics.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`\n=== Done! Generated ${success} articles, ${failed} failed ===`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});

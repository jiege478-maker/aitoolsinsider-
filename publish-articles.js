/**
 * publish-articles.js — 自动生成文章HTML，更新首页和sitemap，部署到Vercel
 *
 * 用法: node publish-articles.js --input articles.json
 *
 * articles.json 格式:
 * [
 *   {
 *     "slug": "article-slug",
 *     "title": "Article Title",
 *     "desc": "Short description for meta and cards",
 *     "category": "Guide|Review|Comparison|Tutorial",
 *     "date": "2026-05-14",
 *     "readTime": "10 min",
 *     "tag": "guide|review|comparison",
 *     "topics": "ai, coding",
 *     "sections": [
 *       { "h2": "Section Title", "p": "Section content paragraph..." }
 *     ],
 *     "related": ["related-article-1.html", "related-article-2.html"]
 *   }
 * ]
 */

const fs = require('fs');
const path = require('path');

// ===== CONFIG =====
const SITE_URL = 'https://toolrankly.com';
const SITE_NAME = 'AI Tools Insider';
const ARTICLES_DIR = path.join(__dirname, 'articles');
const INDEX_PATH = path.join(__dirname, 'index.html');
const SITEMAP_PATH = path.join(__dirname, 'sitemap.xml');

// ===== PARSE ARGS =====
const args = process.argv.slice(2);
const inputFile = args.includes('--input') ? args[args.indexOf('--input') + 1] : null;
if (!inputFile || !fs.existsSync(inputFile)) {
  console.error('Usage: node publish-articles.js --input articles.json');
  process.exit(1);
}

const newArticles = JSON.parse(fs.readFileSync(inputFile, 'utf-8'));
if (!Array.isArray(newArticles) || newArticles.length === 0) {
  console.error('Input file must contain a non-empty array of articles.');
  process.exit(1);
}
// ===== ARTICLE TEMPLATE (same as generate-articles.js) =====
const template = (a) => `<!DOCTYPE html>
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
    "headline": "${a.title}",
    "description": "${a.desc}",
    "author": { "@type": "Organization", "name": "${SITE_NAME}" },
    "datePublished": "${a.date}",
    "dateModified": "${a.date}",
    "publisher": { "@type": "Organization", "name": "${SITE_NAME}" }
  }
  </script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="preload" as="style" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=optional" onload="this.onload=null;this.rel='stylesheet'">
  <noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=optional"></noscript>
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
        <span class="tag tag--${a.tag}">${a.category}</span>
        <h1>${a.title}</h1>
        <p style="font-size:16px;color:var(--text-secondary);margin:8px 0 0;line-height:1.6;">${a.desc}</p>
        <div class="article-meta" style="margin-top:16px;">${a.date} <span class="dot"></span> ${a.readTime} read</div>
      </header>
<div class="content-with-sidebar">
        <div class="article-body">
${a.sections.map((s, i) => {
  let html = `          <h2 id="${s.h2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}">${s.h2}</h2>\n          <p>${s.p}</p>`;
  if ((i + 1) % 2 === 0) {
    html += `\n          <div class="ad-container ad-container--in-content">
            <div class="ad-label">Advertisement</div>
          </div>`;
  }
  return html;
}).join('\n')}
          <div class="ad-container ad-container--footer">
            <div class="ad-label">Advertisement</div>
          </div>
        </div>
        <aside class="sidebar">
          <div class="sidebar-section">
            <h3>Table of Contents</h3>
            <ul class="sidebar-links">
${a.sections.map(s => `              <li><a href="#${s.h2.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}">${s.h2}</a></li>`).join('\n')}
            </ul>
          </div>
          <div class="ad-container ad-container--sidebar">
            <div class="ad-label">Advertisement</div>
          </div>
          <div class="sidebar-section">
            <h3>Related Articles</h3>
            <ul class="sidebar-links">
${a.related.map(r => `              <li><a href="/articles/${r}">${r.replace(/-/g, ' ').replace('.html', '').replace(/\b\w/g, c => c.toUpperCase())}</a></li>`).join('\n')}
            </ul>
          </div>
        </aside>
      </div>
    </article>
    <div class="related-section">
      <h2>More Articles You Might Like</h2>
      <div class="related-grid">
${a.related.map(r => `        <div class="related-card">
          <h3><a href="/articles/${r}">${r.replace(/-/g, ' ').replace('.html', '').replace(/\b\w/g, c => c.toUpperCase())}</a></h3>
        </div>`).join('\n')}
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
<script defer src="/js/script.js"></script>
</body>
</html>`;

// ===== CARD HTML (for index.html) =====
function cardHTML(a) {
  const tagClass = a.tag || a.category.toLowerCase();
  const categoryName = a.category;
  return `      <article class="post-card" data-tag="${tagClass}" data-topics="${a.topics || ''}">
        <div class="post-meta">
          <span class="tag tag--${tagClass}">${categoryName}</span>
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

// ===== STEP 1: Generate article HTML files =====
console.log(`\n=== Generating ${newArticles.length} article(s) ===`);
if (!fs.existsSync(ARTICLES_DIR)) fs.mkdirSync(ARTICLES_DIR, { recursive: true });

const doDeploy = args.includes('--deploy');

for (const a of newArticles) {
  const html = template(a);
  const fp = path.join(ARTICLES_DIR, a.slug + '.html');
  fs.writeFileSync(fp, html, 'utf-8');
  console.log(`  [OK] ${a.slug}.html`);
}

// ===== STEP 2: Update index.html =====
console.log(`\n=== Updating index.html ===`);
let indexHtml = fs.readFileSync(INDEX_PATH, 'utf-8');

// Build new card HTML blocks
const newCards = newArticles.map(a => cardHTML(a)).join('\n\n');

// Insert new cards at the top of the grid (after opening tag)
const gridOpen = '<div class="posts-grid" id="postsGrid">';
const gridStart = indexHtml.indexOf(gridOpen);
if (gridStart === -1) {
  console.error('ERROR: Could not find posts-grid in index.html');
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
}

fs.writeFileSync(INDEX_PATH, indexHtml, 'utf-8');
console.log(`  [OK] Added ${newArticles.length} new card(s), updated count`);

// ===== STEP 3: Update sitemap.xml =====
console.log(`\n=== Updating sitemap.xml ===`);
let sitemap = fs.readFileSync(SITEMAP_PATH, 'utf-8');

const today = new Date().toISOString().split('T')[0];
const newUrlBlocks = newArticles.map(a => `  <url>
    <loc>${SITE_URL}/articles/${a.slug}.html</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>`).join('\n');

// Insert before closing </urlset>
sitemap = sitemap.replace('</urlset>', newUrlBlocks + '\n</urlset>');
// Also update homepage lastmod
sitemap = sitemap.replace(/(<lastmod>)\d{4}-\d{2}-\d{2}(<\/lastmod>)/, `$1${today}$2`);

fs.writeFileSync(SITEMAP_PATH, sitemap, 'utf-8');
console.log(`  [OK] Added ${newArticles.length} URL(s) to sitemap`);

// ===== DONE =====
// ===== STEP 4: Git commit & Vercel deploy (optional) =====
if (doDeploy) {
  console.log(`\n=== Deploying ===`);
  const { execSync } = require('child_process');
  try {
    execSync(`cd "${__dirname}" && git add .`, { stdio: 'pipe' });
    execSync(`cd "${__dirname}" && git commit -m "daily: add ${newArticles.length} AI tutorial articles"`, { stdio: 'pipe' });
    console.log(`  [OK] Git commit`);
    try { execSync(`cd "${__dirname}" && git push origin main`, { stdio: 'pipe', timeout: 120000 }); console.log(`  [OK] Git push`); }
    catch(e) { console.log(`  [WARN] Git push failed (network?): ${e.message}`); }
    try { execSync(`cd "${__dirname}" && npx vercel --prod --yes`, { stdio: 'pipe', timeout: 120000 }); console.log(`  [OK] Vercel deploy`); }
    catch(e) { console.log(`  [WARN] Vercel deploy failed: ${e.message}`); }
  } catch(e) {
    console.log(`  [WARN] Deploy error: ${e.message}`);
  }
}

console.log(`\n✓ Done! Published ${newArticles.length} articles.
  - HTML files: /articles/*.html
  - index.html: cards added, count updated
  - sitemap.xml: URLs added
  ${doDeploy ? '- Deploy: attempted' : '- Deploy: skipped (use --deploy flag to auto-deploy)'}`);

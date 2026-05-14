// publish-only.js — 更新 index.html 和 sitemap.xml（仅新文章）
const fs = require('fs');
const path = require('path');

const SITE_URL = 'https://toolrankly.com';
const INDEX_PATH = 'index.html';
const SITEMAP_PATH = 'sitemap.xml';
const ARTICLES_DIR = 'articles';

// 1. 找出新文章
const sitemap = fs.readFileSync(SITEMAP_PATH, 'utf-8');
const indexed = new Set();
const locMatches = sitemap.match(/<loc>[^<]+<\/loc>/g) || [];
for (const loc of locMatches) {
  const m = loc.match(/articles\/(.+)\.html/);
  if (m) indexed.add(m[1]);
}

const allFiles = fs.readdirSync(ARTICLES_DIR).filter(f => f.endsWith('.html'));
const newSlugs = allFiles.map(f => f.replace('.html', '')).filter(s => !indexed.has(s));

if (newSlugs.length === 0) {
  console.log('No new articles to index.');
  process.exit(0);
}

console.log(`Found ${newSlugs.length} new articles to index:`);

// 2. 从 HTML 提取元数据
function extractMeta(slug) {
  const html = fs.readFileSync(path.join(ARTICLES_DIR, slug + '.html'), 'utf-8');
  const get = (re, def) => (html.match(re) || [, def])[1];
  const title = get(/<title>([^<]*)<\/title>/, slug);
  const desc = get(/name="description" content="([^"]*)"/, '');
  const date = get(/"datePublished":\s*"([^"]*)"/, '2026-05-14');
  const tagMatch = html.match(/class="tag tag--([^"]+)">([^<]+)<\/span>/);
  const tag = tagMatch ? tagMatch[1] : 'guide';
  const cat = tagMatch ? tagMatch[2] : 'Guide';
  const rt = get(/(\d+ min) read/, '8 min');
  return { slug, title, desc, cat, tag, rt, date };
}

const articles = newSlugs.map(extractMeta);
articles.forEach(a => console.log(`  ${a.slug} (${a.cat})`));

// 3. 更新 sitemap.xml
const today = '2026-05-14';
let newSitemap = sitemap;
for (const a of articles) {
  const pri = a.cat === 'Review' ? '0.8' : '0.7';
  const urlBlock = `  <url>\n    <loc>${SITE_URL}/articles/${a.slug}.html</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${pri}</priority>\n  </url>\n</urlset>`;
  newSitemap = newSitemap.replace('</urlset>', urlBlock);
}
newSitemap = newSitemap.replace(/(<lastmod>)\d{4}-\d{2}-\d{2}(<\/lastmod>)/, '$1' + today + '$2');
fs.writeFileSync(SITEMAP_PATH, newSitemap, 'utf-8');
console.log(`\n✓ sitemap.xml: added ${articles.length} URLs`);

// 4. 更新 index.html
function fmtDate(d) {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const dt = new Date(d);
  return months[dt.getMonth()] + ' ' + dt.getDate() + ', ' + dt.getFullYear();
}

function cardHTML(a) {
  return [
    `<article class="post-card" data-tag="${a.tag}" data-topics="">`,
    `        <div class="post-meta">`,
    `          <span class="tag tag--${a.tag}">${a.cat}</span>`,
    `          <span>${fmtDate(a.date)}</span>`,
    `        </div>`,
    `        <h2><a href="/articles/${a.slug}.html">${a.title}</a></h2>`,
    `        <p class="post-excerpt">${a.desc}</p>`,
    `        <div class="post-footer">`,
    `          <span class="read-time">${a.rt} read</span>`,
    `          <a href="/articles/${a.slug}.html">Read →</a>`,
    `        </div>`,
    `      </article>`
  ].join('\n');
}

let idxHtml = fs.readFileSync(INDEX_PATH, 'utf-8');
const cards = articles.map(cardHTML).join('\n\n');
const marker = '<div class="posts-grid" id="postsGrid">';
const insertAt = idxHtml.indexOf(marker) + marker.length;
idxHtml = idxHtml.slice(0, insertAt) + '\n\n' + cards + '\n\n' + idxHtml.slice(insertAt);

const countMatch = idxHtml.match(/<span class="count">(\d+) articles?<\/span>/);
if (countMatch) {
  const oldCount = parseInt(countMatch[1]);
  const newCount = oldCount + articles.length;
  idxHtml = idxHtml.replace(countMatch[0], `<span class="count">${newCount} articles</span>`);
  console.log(`✓ index.html count: ${oldCount} → ${newCount}`);
}

fs.writeFileSync(INDEX_PATH, idxHtml, 'utf-8');
console.log(`✓ index.html: added ${articles.length} cards at top of grid`);
console.log('\n✅ Done!');

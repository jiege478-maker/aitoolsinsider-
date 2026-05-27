/**
 * generate-sitemap.js — 从 Supabase 读取已发布文章，重新生成 sitemap.xml
 *
 * 用法:
 *   node generate-sitemap.js             # 仅生成 sitemap.xml
 *   node generate-sitemap.js --deploy    # 生成后自动部署到 Vercel
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const SITEMAP_PATH = path.join(__dirname, 'sitemap.xml');
const SITE_URL = 'https://www.toolrankly.com';

// 读取 .env
const envFile = path.join(__dirname, 'crawler', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    process.env[trimmed.substring(0, eqIdx).trim()] = trimmed.substring(eqIdx + 1).trim();
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY;

if (!SERVICE_KEY) {
  console.error('No Supabase service key found');
  process.exit(1);
}

async function generateSitemap() {
  console.log('Fetching published articles from Supabase...');

  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?published=eq.true&select=slug,updated_at`, {
    headers: {
      'apikey': SERVICE_KEY,
      'Authorization': `Bearer ${SERVICE_KEY}`,
    },
  });

  if (!res.ok) {
    console.error(`Failed to fetch articles: ${res.status}`);
    process.exit(1);
  }

  const articles = await res.json();
  const today = new Date().toISOString().slice(0, 10);

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

  // Static pages
  const staticPages = [
    { loc: `${SITE_URL}/`, priority: '1.0', changefreq: 'weekly' },
    { loc: `${SITE_URL}/about.html`, priority: '0.3', changefreq: 'monthly' },
    { loc: `${SITE_URL}/contact.html`, priority: '0.3', changefreq: 'monthly' },
    { loc: `${SITE_URL}/privacy.html`, priority: '0.2', changefreq: 'monthly' },
  ];
  for (const p of staticPages) {
    xml += `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
  }

  // Article pages
  for (const a of articles) {
    const mod = (a.updated_at || '').slice(0, 10) || today;
    const slug = encodeURIComponent(a.slug);
    xml += `  <url>\n    <loc>${SITE_URL}/article?slug=${slug}</loc>\n    <lastmod>${mod}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
  }

  xml += '</urlset>';

  fs.writeFileSync(SITEMAP_PATH, xml, 'utf-8');
  console.log(`\n✓ sitemap.xml generated: ${staticPages.length} static + ${articles.length} articles = ${staticPages.length + articles.length} URLs`);

  return articles.length;
}

async function deploy() {
  console.log('\nDeploying to Vercel...');
  try {
    const output = execSync('npx vercel --prod --yes', { cwd: __dirname, timeout: 120000 });
    console.log(output.toString());
    console.log('✓ Deployed successfully');
  } catch (e) {
    console.error('Deploy failed:', e.message);
    process.exit(1);
  }
}

async function main() {
  const shouldDeploy = process.argv.includes('--deploy');

  const count = await generateSitemap();

  if (shouldDeploy) {
    await deploy();
  }

  console.log('\nDone!');
}

main().catch(console.error);

/**
 * Fix existing article content: strip styles, ids, data attrs, extra sections
 */
const fs = require('fs');
const path = require('path');
const envFile = path.join(__dirname, '.env');
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
if (!SERVICE_KEY) { console.error('No service key'); process.exit(1); }

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': 'Bearer ' + SERVICE_KEY,
  'Content-Type': 'application/json',
};

function sanitizeHtml(html) {
  if (!html) return html;
  let s = html;
  s = s.replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, '');
  s = s.replace(/<source[^>]*>/gi, '');
  s = s.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, '');
  s = s.replace(/<noscript[^>]*>[\s\S]*?<\/noscript>/gi, '');
  s = s.replace(/<picture[^>]*>([\s\S]*?)<\/picture>/gi, (m, inner) => {
    const img = inner.match(/<img[^>]*>/i);
    return img ? img[0] : '';
  });
  s = s.replace(/<figure[^>]*>([\s\S]*?)<\/figure>/gi, '$1');
  s = s.replace(/<section[^>]*>[\s\S]*?<\/section>/gi, '');
  s = s.replace(/<aside[^>]*>[\s\S]*?<\/aside>/gi, '');
  s = s.replace(/<div[^>]*>[\s\S]*?\b(keep reading|related\s+(articles|posts)|view\s+all)\b[\s\S]*?<\/div>/gi, '');
  s = s.replace(/\sstyle="[^"]*"/gi, '');
  s = s.replace(/\sid="[^"]*"/gi, '');
  s = s.replace(/\sclass="[^"]*"/gi, '');
  s = s.replace(/\s(on\w+)="[^"]*"/gi, '');
  s = s.replace(/\s(aria-\w+)="[^"]*"/gi, '');
  s = s.replace(/\srole="[^"]*"/gi, '');
  s = s.replace(/\sdata-\w+(?:-\w+)*="[^"]*"/gi, '');
  s = s.replace(/<picture[^>]*>\s*<\/picture>/gi, '');
  s = s.replace(/<p[^>]*>\s*<\/p>/gi, '');
  s = s.replace(/<div[^>]*>\s*<\/div>/gi, '');
  s = s.replace(/<span[^>]*>\s*<\/span>/gi, '');
  // Also strip hr and source line (will be re-added on fresh scrape)
  s = s.replace(/<hr[^>]*>[\s\S]*?Source:.*?<\/a><\/em><\/p>/i, '');
  return s.trim();
}

async function main() {
  console.log('Fetching articles with problematic content...');
  const limit = 100;

  // First check total
  const countRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id&limit=0`, { headers });
  const cr = countRes.headers.get('content-range') || '';
  const m = cr.match(/\/(\d+)$/);
  console.log('Total articles:', m ? m[1] : 'unknown');

  let page = 0;
  let total = 0, fixed = 0;

  while (true) {
    const start = page * limit;
    const end = start + limit - 1;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id,slug,content&limit=${limit}`, {
      headers: { ...headers, 'Range': `${start}-${end}`, 'Prefer': 'count=exact' },
    });
    if (!res.ok) break;
    const articles = await res.json();
    if (!articles || !articles.length) break;

    for (const a of articles) {
      total++;
      if (!a.content) continue;
      const clean = sanitizeHtml(a.content);
      if (clean === a.content) continue;

      const updRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${a.id}`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ content: clean }),
      });
      if (updRes.ok || updRes.status === 204) {
        const diff = a.content.length - clean.length;
        console.log(`  [OK] #${a.id} ${a.slug}: ${diff > 0 ? '-' + diff : '+' + (-diff)} chars`);
        fixed++;
      } else {
        console.log(`  [ERR] #${a.id}: ${updRes.status}`);
      }
    }
    if (articles.length < limit) break;
    page++;
  }
  console.log(`\nDone: ${total} checked, ${fixed} fixed`);
}

main().catch(console.error);

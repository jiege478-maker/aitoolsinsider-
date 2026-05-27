/**
 * Delete draft articles that are tutorials, deployment guides, or research papers
 * (not suitable for a tool review site).
 *
 * Usage: node crawler/delete-bad-drafts.js
 *   DRY_RUN=true node crawler/delete-bad-drafts.js  # Preview only
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY not set');
  process.exit(1);
}

const DRY_RUN = process.env.DRY_RUN === 'true';

const HEADERS = {
  'apikey': SUPABASE_SERVICE_KEY,
  'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
  'Content-Type': 'application/json',
};

async function fetchDrafts() {
  const url = `${SUPABASE_URL}/rest/v1/articles?select=id,title,slug,description&eq(published,false)&order=created_at.desc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('Fetch failed: ' + res.status);
  return res.json();
}

async function deleteArticle(id) {
  const url = `${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`;
  const res = await fetch(url, { method: 'DELETE', headers: HEADERS });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Delete failed (${res.status}): ${err}`);
  }
  return true;
}

// Title patterns that indicate tutorial/deployment/research content
const BAD_TITLE_PATTERNS = [
  // Deployment guides
  /deploy\s+(.*?)\s+on\s+(aws|azure|gcp|cloud|kubernetes|docker)/i,
  /deploying\s+(.*?)\s+(on|to|using)\s+(aws|azure|gcp|cloud)/i,
  /deployment\s+(guide|tutorial)/i,

  // Tutorial patterns
  /^(how to|guide to|tutorial|building|creating|implementing|training)\s/i,
  /getting\s+started\s+with/i,
  /from\s+scratch(\s+in|\s+using|\s+with)/i,
  /step[-\s]by[-\s]step/i,
  /comprehensive\s+guide/i,
  /^(generate|create|build)\s+.*\s+(with|using)\s+(claude|chatgpt|gpt|llm|hugging\s*face)/i,
  /how\s+(to\s+)?(i\s+)?(built|created|made|wrote|generate)\s/i,

  // Fine-tuning
  /fine.?tun(e|ing)\s+(.*?)\s+(model|llm|gpt|bert|transformer)/i,
  /fine.?tun(e|ing)\s+(.*?)\s+on\s+(custom|dataset|data)/i,

  // Product announcements / technical deep-dives
  /^introducing\s+/i,
  /how\s+(they.are|it.s)\s+built/i,
  /on\s+hugging\s*face\s+(inference|spaces)/i,

  // Research paper patterns
  /^(toward|towards|survey|a\s+survey)\s/i,
  /^[^:]+:\s+\w+\s+(model|approach|method|framework|benchmark|dataset|system|architecture)$/i,
  /bench(marks?)?\s*(for|of|in)/i,
  /guardrail/i,

  // GitHub cookbook/repo tutorials
  /cookbook/i,
  /official\s+(tutorial|guide|example|notebooks)/i,
  /recipes/i,
];

// Content patterns that indicate junk articles
const BAD_CONTENT_PATTERNS = [
  /arxiv/i,
  /paper\s+(published|accepted|presented)/i,
  /experimental\s+results/i,
  /state.of.the.art/i,
];

function isBadArticle(title, description) {
  const t = (title || '').toLowerCase();
  const d = (description || '').toLowerCase();
  const text = t + ' ' + d;

  for (const pattern of BAD_TITLE_PATTERNS) {
    if (pattern.test(t)) return true;
  }

  for (const pattern of BAD_CONTENT_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  return false;
}

// Keep these articles even if they match bad patterns
const KEEP_TITLES = [
  /best\s+ai/i,
  /vs\s+/i,
  /review/i,
  /comparison/i,
  /alternative/i,
  /top\s+\d+/i,
  /pricing/i,
  /cost/i,
  /worth/i,
];

function shouldKeep(title) {
  const t = (title || '').toLowerCase();
  for (const pattern of KEEP_TITLES) {
    if (pattern.test(t)) return true;
  }
  return false;
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no deletions will happen\n' : '🗑️  Deleting bad draft articles...\n');

  const drafts = await fetchDrafts();
  console.log(`Found ${drafts.length} draft articles\n`);

  let deleted = 0;
  let skipped = 0;

  for (const article of drafts) {
    if (shouldKeep(article.title)) {
      console.log(`  [KEEP] ${article.title.substring(0, 60)}`);
      skipped++;
      continue;
    }

    if (!isBadArticle(article.title, article.description)) {
      console.log(`  [—]   ${article.title.substring(0, 60)}`);
      skipped++;
      continue;
    }

    console.log(`  [DEL] ${article.title.substring(0, 60)}`);

    if (!DRY_RUN) {
      await deleteArticle(article.id);
    }

    deleted++;
  }

  console.log(`\nDone. Deleted: ${deleted}, Skipped/Kept: ${skipped}`);
  if (DRY_RUN) {
    console.log('\nRun without DRY_RUN=true to apply deletions.');
  }
}

main().catch(console.error);

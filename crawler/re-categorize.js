/**
 * Re-categorize existing articles with new CATEGORIES keywords.
 *
 * Usage:
 *   node crawler/re-categorize.js              # Normal: update changed articles
 *   node crawler/re-categorize.js DRY_RUN=true # Preview only
 */

const fs = require('fs');
const path = require('path');

// ===== Load .env =====
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.substring(0, eqIdx).trim();
    const val = trimmed.substring(eqIdx + 1).trim();
    if (!process.env[key]) process.env[key] = val;
  }
}

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const DRY_RUN = process.argv.includes('DRY_RUN=true') || process.env.DRY_RUN === 'true';

if (!SUPABASE_SERVICE_KEY) {
  console.error('ERROR: SUPABASE_SERVICE_KEY not set.');
  process.exit(1);
}

// ===== New CATEGORIES (must stay in sync with crawler.js) =====
const CATEGORIES = [
  { id: 1, name: 'Writing', keywords: ['writing', 'write', 'essay', 'content', 'copywriting', 'blog', 'grammar', 'paraphraser', 'storytelling', 'creative writing', 'article writer', 'text generation', 'nlp', 'natural language', 'language model', 'summarization', 'translation', 'document', 'chatbot', 'conversation', 'semantic', 'sentiment', 'linguistics', 'corpus'] },
  { id: 2, name: 'Image', keywords: ['image', 'photo', 'stable diffusion', 'midjourney', 'dall-e', 'dalle', 'art', 'design', 'visual', 'image generation', 'generate image', 'ai art', 'illustration', 'photo editing', 'computer vision', 'object detection', 'segmentation', 'generative adversarial', 'vae', 'diffusion model', 'style transfer', 'super resolution', 'image recognition', 'captioning', 'face recognition'] },
  { id: 3, name: 'Coding', keywords: ['programming', 'developer', 'github copilot', 'copilot', 'cursor', 'api', 'web dev', 'frontend', 'backend', 'full stack', 'open source', 'sdk', 'debug', 'deploy', 'software development', 'agent', 'framework', 'library', 'tensorflow', 'pytorch', 'code example', 'codebase', 'implementation', 'import', 'dataset', 'algorithm', 'notebook', 'code', 'coding', 'deep learning', 'neural network', 'machine learning'] },
  { id: 4, name: 'Video', keywords: ['video', 'movie', 'film', 'animation', 'editing', 'screen record', 'motion', 'premiere', 'after effects', 'video generation', 'tiktok', 'youtube', 'render', 'video understanding', 'scene', 'multimodal', 'video editing', 'video classification'] },
  { id: 5, name: 'Productivity', keywords: ['productivity', 'workflow', 'automation', 'meeting', 'note', 'calendar', 'task', 'schedule', 'project management', 'email', 'organization', 'efficiency', 'time management', 'rag', 'retrieval augmented', 'knowledge base', 'recommendation', 'optimization', 'pipeline', 'integration', 'database'] },
];

// ===== detectCategory (mirrors crawler.js with \b word boundaries) =====
function detectCategory(title, content) {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();
  let best = { id: 1, score: 0 };

  for (const cat of CATEGORIES) {
    let score = 0;
    for (const kw of cat.keywords) {
      const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`\\b${escaped}\\b`, 'gi');

      const titleMatches = titleLower.match(regex);
      if (titleMatches) score += titleMatches.length * 3;

      const contentMatches = contentLower.match(regex);
      if (contentMatches) score += contentMatches.length;
    }
    if (score > best.score) {
      best = { id: cat.id, score };
    }
  }

  return best;
}

// ===== Main =====
async function main() {
  const authHeaders = {
    'apikey': SUPABASE_SERVICE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
  };

  console.log('========================================');
  console.log('  Re-categorize Existing Articles');
  console.log('  Dry run:', DRY_RUN);
  console.log('========================================\n');

  // Fetch all articles with content
  console.log('Fetching articles from Supabase...');
  const res = await fetch(`${SUPABASE_URL}/rest/v1/articles?select=id,title,content,category_id&order=id.desc`, {
    headers: authHeaders,
  });

  if (!res.ok) {
    console.error('Failed to fetch articles:', await res.text());
    process.exit(1);
  }

  const articles = await res.json();
  console.log(`Found ${articles.length} articles\n`);

  let changed = 0;
  let unchanged = 0;

  for (const article of articles) {
    const title = article.title || '';
    const content = article.content || '';
    const oldCat = article.category_id;

    // Strip emoji from content before scoring
    const cleanContent = content.replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{2934}\u{2935}\u{25AA}\u{25AB}\u{25FB}\u{25FC}\u{25FD}\u{25FE}\u{2B05}\u{2B06}\u{2B07}\u{2B1B}\u{2B1C}\u{2B50}\u{2B55}\u{3030}\u{303D}\u{3297}\u{3299}]/gu, '');

    const { id: newCat, score } = detectCategory(title, cleanContent);

    const oldCatName = CATEGORIES.find(c => c.id === oldCat)?.name || 'Unknown';
    const newCatName = CATEGORIES.find(c => c.id === newCat)?.name || 'Unknown';

    if (newCat !== oldCat) {
      console.log(`[CHANGE] ID ${article.id}`);
      console.log(`  Title: ${title.substring(0, 70)}`);
      console.log(`  ${oldCatName} (${oldCat}) → ${newCatName} (${newCat}) [score: ${score}]`);

      if (!DRY_RUN) {
        const updateRes = await fetch(`${SUPABASE_URL}/rest/v1/articles?id=eq.${article.id}`, {
          method: 'PATCH',
          headers: {
            ...authHeaders,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation',
          },
          body: JSON.stringify({ category_id: newCat }),
        });

        if (!updateRes.ok) {
          console.log(`  [ERR] Update failed: ${await updateRes.text()}`);
        } else {
          console.log(`  [OK] Updated`);
        }
      }
      changed++;
    } else {
      console.log(`[KEEP]  ID ${article.id} | ${oldCatName} | score=${score} | ${title.substring(0, 50)}`);
      unchanged++;
    }
  }

  console.log('\n========================================');
  console.log(`  Total: ${articles.length}`);
  console.log(`  Changed: ${changed}`);
  console.log(`  Unchanged: ${unchanged}`);
  console.log(`  Dry run: ${DRY_RUN}`);
  if (!DRY_RUN) console.log('  (Changes committed to DB)');
  console.log('========================================');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });

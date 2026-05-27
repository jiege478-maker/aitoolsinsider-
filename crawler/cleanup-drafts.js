/**
 * Clean up junk content (avatar images, social buttons, author bios) from existing draft articles.
 *
 * Usage: node cleanup-drafts.js
 *   DRY_RUN=true node cleanup-drafts.js  # Preview only, no updates
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
  'Prefer': 'return=representation',
};

async function fetchDrafts() {
  const url = `${SUPABASE_URL}/rest/v1/articles?select=id,title,slug,content,description&eq(published,false)&order=created_at.desc`;
  const res = await fetch(url, { headers: HEADERS });
  if (!res.ok) throw new Error('Fetch failed: ' + res.status);
  return res.json();
}

async function updateArticle(id, data) {
  const url = `${SUPABASE_URL}/rest/v1/articles?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: HEADERS,
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Update failed (${res.status}): ${err}`);
  }
  return true;
}

// Patterns to remove from content HTML
function cleanContent(html) {
  if (!html) return html;

  let cleaned = html;

  // 1. Remove author/profile metadata blocks (HuggingFace blog style)
  // Pattern: "Published on ... · Update on GitHub · Upvote ..." or similar
  cleaned = cleaned.replace(/<p>[^<]*(Published|Updated|Upvote|downvote|vote)[^<]*<\/p>\s*(?:<p>[^<]*<\/p>\s*)*/gi, '');

  // Remove "Update on GitHub" links
  cleaned = cleaned.replace(/<a[^>]*href="[^"]*github\.com[^"]*"[^>]*>[\s\S]{0,200}?<\/a>/gi, '');

  // Remove "Upvote X" / "+X" / "X votes" text blocks
  cleaned = cleaned.replace(/(Upvote\s*\d+|[-+]\s*\d+|[\d,]+\s+(upvotes?|votes?|reactions?|likes?|stars?|hearts?))/gi, '');

  // 2. Remove author list sections (multiple authors with profile links)
  // Match patterns like: "AuthorName · username · AuthorName2 · username2"
  cleaned = cleaned.replace(/[\s\S]{0,50}?(author|by|written by|posted by)[\s\S]{0,500}?(github\.com|twitter\.com|x\.com|linkedin\.com)[\s\S]{0,200}?(author|by|written|posted|share|tweet|follow)/gi, '');

  // Remove author list: divs containing github.com links with usernames
  // HuggingFace style: each author has a link with their GitHub handle
  cleaned = cleaned.replace(/(?:<[^>]+>\s*)*(?:@\w+|github\.com\/\w+|twitter\.com\/\w+)(?:\s*<[^>]+>)*/gi, '');

  // 3. Remove entire sections that look like author cards/bios
  const sectionPatterns = [
    // Author cards with avatar + name + bio
    /<div[^>]*class="[^"]*\b(author-card|author-bio|author-info|byline|profile-card|user-card)\b[^"]*"[^>]*>[\s\S]{0,2000}?<\/div>/gi,
    // Social sharing sections
    /<div[^>]*class="[^"]*\b(social-share|share-buttons|post-share|sharing|social-actions)\b[^"]*"[^>]*>[\s\S]{0,1000}?<\/div>/gi,
    // Follow/subscribe sections
    /<div[^>]*class="[^"]*\bfollow[-\s]*(btn|button|us|me|card|section)\b[^"]*"[^>]*>[\s\S]{0,1000}?<\/div>/gi,
    // Newsletter signup
    /<div[^>]*class="[^"]*\b(newsletter|subscribe|email-signup|mailing-list)\b[^"]*"[^>]*>[\s\S]{0,1500}?<\/div>/gi,
    // Upvote/vote widgets
    /<div[^>]*class="[^"]*\b(vote|upvote|voting|reactions)\b[^"]*"[^>]*>[\s\S]{0,500}?<\/div>/gi,
    // Bookmark/save buttons
    /<div[^>]*class="[^"]*\b(bookmark|save-article|save-post)\b[^"]*"[^>]*>[\s\S]{0,500}?<\/div>/gi,
    // Article metadata (date, reading time, author byline)
    /<div[^>]*class="[^"]*\b(article-meta|post-meta|byline|meta-data|published|post-date|author-list)\b[^"]*"[^>]*>[\s\S]{0,1500}?<\/div>/gi,
  ];

  for (const pattern of sectionPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 4. Remove avatar/profile images by various attributes
  const imgPatterns = [
    // img with avatar/author/photo in class
    /<img[^>]*class="[^"]*\b(avatar|author|profile|photo|thumbnail|headshot)\b[^"]*"[^>]*>/gi,
    // img with avatar/author/photo in alt
    /<img[^>]*alt="[^"]*\b(avatar|author photo|profile photo|profile pic|headshot)\b[^"]*"[^>]*>/gi,
    // img with gravatar URL
    /<img[^>]*src="[^"]*gravatar\.com[^"]*"[^>]*>/gi,
    // img with avatar in src
    /<img[^>]*src="[^"]*\/avatar[^"]*"[^>]*>/gi,
    // img that are very small (typically avatars) - width OR height <= 40
    /<img[^>]*(?:width|height)="[0-9]{1,2}"[^>]*(?:width|height)="[0-9]{1,2}"[^>]*>/gi,
    // img with data: URI (tiny icons)
    /<img[^>]*src="data:image\/[^"]{0,100}"[^>]*>/gi,
  ];

  for (const pattern of imgPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }

  // 5. Remove empty tags that remain after removing content
  cleaned = cleaned.replace(/<a[^>]*>\s*<\/a>/gi, '');
  cleaned = cleaned.replace(/<span[^>]*>\s*<\/span>/gi, '');
  cleaned = cleaned.replace(/<div[^>]*>\s*<\/div>/gi, '');

  // 6. Remove common UI junk
  cleaned = cleaned.replace(/<button[^>]*class="[^"]*\b(follow|upvote|share|bookmark|subscribe|clap|reaction)\b[^"]*"[^>]*>[\s\S]{0,200}?<\/button>/gi, '');
  cleaned = cleaned.replace(/<footer[^>]*>[\s\S]{0,2000}?<\/footer>/gi, '');
  cleaned = cleaned.replace(/<aside[^>]*>[\s\S]{0,2000}?<\/aside>/gi, '');

  // 7. Remove "Published on" / "Updated on" / "Upvote" standalone text with GitHub links
  // HuggingFace specific: "Published Sep 11, 2025 · Update on GitHub · Upvote 188"
  cleaned = cleaned.replace(/Published\s+\w+\s+\d+[ ,]+\d{4}[\s\S]{0,100}?(?:Update on GitHub|Upvote|github\.com)/gi, '');
  // Remove "+NN" upvote counts at start of paragraphs
  cleaned = cleaned.replace(/^[+-]\d+\s*/gm, '');
  // Remove lines containing only usernames with @ symbol
  cleaned = cleaned.replace(/^@\w+[\s,]*$/gm, '');
  // Remove "·" separator dots with surrounding whitespace
  cleaned = cleaned.replace(/\s*·\s*/g, ' ');

  // 8. Clean up excessive whitespace
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  cleaned = cleaned.replace(/<br\s*\/?>\s*<br\s*\/?>\s*<br\s*\/?>/gi, '<br><br>');

  return cleaned.trim();
}

async function main() {
  console.log(DRY_RUN ? '🔍 DRY RUN — no changes will be made\n' : '🧹 Cleaning up draft articles...\n');

  const drafts = await fetchDrafts();
  console.log(`Found ${drafts.length} draft articles\n`);

  let cleaned = 0;
  let skipped = 0;

  for (const article of drafts) {
    const original = article.content || '';
    const cleanedContent = cleanContent(original);

    // Check if anything was removed
    const removedLen = original.length - cleanedContent.length;

    if (removedLen < 10) {
      console.log(`  [—] ${article.title.substring(0, 50)} — nothing to clean`);
      skipped++;
      continue;
    }

    console.log(`  [✓] ${article.title.substring(0, 50)} — removed ${removedLen} chars`);

    if (!DRY_RUN) {
      await updateArticle(article.id, { content: cleanedContent });
    }

    cleaned++;
  }

  console.log(`\nDone. Cleaned: ${cleaned}, Skipped: ${skipped}`);
  if (DRY_RUN) {
    console.log('\nRun without DRY_RUN=true to apply changes.');
  }
}

main().catch(console.error);

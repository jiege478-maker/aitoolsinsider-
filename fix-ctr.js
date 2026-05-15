const fs = require('fs');
const path = require('path');

// ========================================================
// CTR Optimization: shorten titles, add FAQ schema detection
// ========================================================

function shortenTitle(title) {
  let t = title;
  const len = t.length;

  // If already short enough, skip
  if (len <= 58) return t;

  // Strategy 1: Remove "in 2026" → "2026"
  t = t.replace(/ in 2026/g, ' 2026');

  // Strategy 2: Remove "Ultimate " or "Complete " or "Comprehensive "
  t = t.replace(/\b(Ultimate|Complete|Comprehensive|Essential|Definitive)\s/gi, '');

  // Strategy 3: Replace "Step-by-Step" with "Guide"
  t = t.replace(/Step-by-Step/gi, 'Guide');

  // Strategy 4: Shorten "Tutorial" → "Guide"
  t = t.replace(/\bTutorial\b/gi, 'Guide');

  // Strategy 5: Remove redundant suffixes after year
  // Pattern: "...2026: Long descriptive subtitle" → keep before colon only
  t = t.replace(/^(How to [^:]+):.*$/gm, (match, p1) => {
    // Keep if shortening works
    return p1.length > 50 ? p1 : match;
  });

  // Strategy 6: Remove trailing "Compared" or "[Comparison]" labels
  t = t.replace(/\s*(Compared|\[Comparison\]|\(Compared\))$/i, '');

  // Strategy 7: Remove "for Beginners" from titles (redundant)
  t = t.replace(/ for Beginners/i, '');

  // Strategy 8: Replace long separator " - " with ": "
  t = t.replace(/ - /g, ': ');

  // Strategy 9: Remove trailing " [Year]" patterns if already in title
  // Keep single "2026" at end, remove if year appears twice
  const yearCount = (t.match(/2026/g) || []).length;
  if (yearCount > 1) {
    t = t.replace(/2026/, '');
    t = t.replace(/\s+/, ' ') + ' 2026';
  }

  // Strategy 10: Trim to 58 chars max on word boundary
  if (t.length > 58) {
    const truncated = t.substring(0, 56);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > 30) {
      t = t.substring(0, lastSpace) + '…';
    } else {
      t = t.substring(0, 55) + '…';
    }
  }

  return t;
}

function improveDescription(desc, category) {
  // Add CTA to descriptions that don't have one
  const ctaPatterns = [
    'Read our', 'Learn', 'Find out', 'Discover', 'See which',
    'Compare', 'See how', 'Read', 'Click'
  ];
  const hasCTA = ctaPatterns.some(p => desc.startsWith(p));

  if (hasCTA) return desc;

  // Add CTA based on category
  if (category === 'comparison' || desc.toLowerCase().includes('vs') || desc.toLowerCase().includes('compare')) {
    return 'See which one wins. ' + desc;
  }
  if (category === 'review') {
    return 'Read our hands-on review. ' + desc;
  }
  if (category === 'guide' || category === 'tutorial') {
    return 'Learn how. ' + desc;
  }
  return desc;
}

// Process articles
const dir = 'articles';
let count = 0;
let descCount = 0;

fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf-8');
  const orig = content;

  // --- Fix title ---
  const titleMatch = content.match(/<title>([^<]+)<\/title>/);
  if (titleMatch) {
    const oldTitle = titleMatch[1];
    const newTitle = shortenTitle(oldTitle);
    if (newTitle !== oldTitle) {
      content = content.replace(`<title>${oldTitle}</title>`, `<title>${newTitle}</title>`);
      // Also fix og:title
      content = content.replace(
        `<meta property="og:title" content="${oldTitle}">`,
        `<meta property="og:title" content="${newTitle}">`
      );
      // Fix twitter:title
      content = content.replace(
        `<meta name="twitter:title" content="${oldTitle}">`,
        `<meta name="twitter:title" content="${newTitle}">`
      );
      // Fix headline in schema
      content = content.replace(
        `"headline": "${oldTitle}"`,
        `"headline": "${newTitle}"`
      );
      count++;
    }
  }

  // --- Improve meta description with CTA ---
  const descMatch = content.match(/<meta name="description" content="([^"]+)">/);
  if (descMatch) {
    const oldDesc = descMatch[1];
    const newDesc = improveDescription(oldDesc);
    if (newDesc !== oldDesc && newDesc.length <= 165) {
      content = content.replace(
        `<meta name="description" content="${oldDesc}">`,
        `<meta name="description" content="${newDesc}">`
      );
      // Update og:description
      content = content.replace(
        `<meta property="og:description" content="${oldDesc}">`,
        `<meta property="og:description" content="${newDesc}">`
      );
      // Update twitter:description
      content = content.replace(
        `<meta name="twitter:description" content="${oldDesc}">`,
        `<meta name="twitter:description" content="${newDesc}">`
      );
      descCount++;
    }
  }

  if (content !== orig) {
    fs.writeFileSync(fp, content);
  }
});

console.log(`Titles shortened: ${count}`);
console.log(`Descriptions improved: ${descCount}`);

// --- Fix index.html title ---
let indexHtml = fs.readFileSync('index.html', 'utf-8');
let idxOrig = indexHtml;
const idxTitleMatch = indexHtml.match(/<title>([^<]+)<\/title>/);
if (idxTitleMatch) {
  const old = idxTitleMatch[1];
  const shortened = shortenTitle(old);
  if (shortened !== old) {
    indexHtml = indexHtml.replace(`<title>${old}</title>`, `<title>${shortened}</title>`);
    indexHtml = indexHtml.replace(
      `<meta property="og:title" content="${old}">`,
      `<meta property="og:title" content="${shortened}">`
    );
    indexHtml = indexHtml.replace(
      `<meta name="twitter:title" content="${old}">`,
      `<meta name="twitter:title" content="${shortened}">`
    );
  }
}
if (indexHtml !== idxOrig) {
  fs.writeFileSync('index.html', indexHtml);
  console.log('Index title fixed');
}

console.log('\nDone!');

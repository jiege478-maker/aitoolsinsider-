const fs = require('fs');
const path = require('path');

// ========================================================
// Add Product + Review JSON-LD schema for articles with
// explicit "Score: X/10" ratings (best-of lists)
// ========================================================

const dir = 'articles';
let productCount = 0;

fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => {
  const fp = path.join(dir, f);
  let content = fs.readFileSync(fp, 'utf-8');
  const orig = content;

  // Extract headline from schema
  const headlineMatch = content.match(/"headline":\s*"([^"]+)"/);
  const descMatch = content.match(/"description":\s*"([^"]+)"/);

  if (!headlineMatch) return;

  // Find all Score: X/10 patterns with tool context
  const scoreRegex = /<h3>(\d+\.\s*)?([^<]+)<\/h3>[\s\S]*?<strong>Score:<\/strong>\s*(\d+\.?\d*)\/10/gi;
  const scores = [];
  let match;

  while ((match = scoreRegex.exec(content)) !== null) {
    const toolName = match[2].replace(/<[^>]+>/g, '').trim().replace(/—.*$/, '').trim();
    const score = parseFloat(match[3]);
    if (toolName && score > 0 && score <= 10) {
      scores.push({ name: toolName, score });
    }
  }

  if (scores.length === 0) return;

  // Check if Product schema already exists
  if (content.includes('"@type":"Product"') || content.includes('"@type": "Product"')) return;

  // Build Product + Review schema for the top 3 tools (SERP only shows first)
  const topScores = scores.slice(0, 3);
  const products = topScores.map((s, i) => ({
    "@type": "Product",
    "name": s.name,
    "review": {
      "@type": "Review",
      "reviewRating": {
        "@type": "Rating",
        "ratingValue": s.score,
        "bestRating": 10
      },
      "author": {
        "@type": "Organization",
        "name": "AI Tools Insider"
      }
    }
  }));

  // If only one product, add aggregateRating too
  if (topScores.length === 1) {
    products[0].aggregateRating = {
      "@type": "AggregateRating",
      "ratingValue": topScores[0].score,
      "bestRating": 10,
      "ratingCount": 1
    };
  }

  const productSchema = {
    "@context": "https://schema.org",
    "@graph": products
  };

  // Insert before </head>
  const schemaBlock = `\n  <script type="application/ld+json">\n  ${JSON.stringify(productSchema, null, 2)}\n  </script>`;
  content = content.replace('</head>', schemaBlock + '\n</head>');

  if (content !== orig) {
    fs.writeFileSync(fp, content);
    productCount++;
    console.log(`  ${f}: ${scores.length} tools scored (top: ${scores[0].name} ${scores[0].score}/10)`);
  }
});

console.log(`\nArticles with Product schema added: ${productCount}`);
console.log('Done!');

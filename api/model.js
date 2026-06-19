// API endpoint for model detail pages — SSR from model.html template
const fs = require('fs');
const path = require('path');

module.exports = async (req, res) => {
  const slug = req.query.slug;
  if (!slug) return res.status(404).send('Not found');

  try {
    const templatePath = path.join(process.cwd(), 'model.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    // Read embedded model data from the HTML (it's in a <script> tag)
    const dataMatch = html.match(/const M\s*=\s*(\[[\s\S]*?\]);/);
    if (!dataMatch) {
      return res.status(500).send('Model data not found in template');
    }

    const models = JSON.parse(dataMatch[1]);
    const model = models.find(m => m.s === slug);

    if (!model) {
      return res.status(404).send('Model not found');
    }

    const title = model.t || model.title || 'Model';
    const description = model.use || model.description || '';
    const canonical = `https://www.toolrankly.com/model/${encodeURIComponent(slug)}`;

    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Product',
      name: title,
      description: description,
      review: {
        '@type': 'Review',
        reviewRating: {
          '@type': 'Rating',
          ratingValue: parseFloat(model.r) || 0,
          bestRating: 5,
        }
      }
    });

    html = html.replace('<!-- SSR_TITLE -->', title);
    html = html.replace('<!-- SSR_DESC -->', description);
    html = html.replaceAll('<!-- SSR_CANONICAL -->', canonical);
    html = html.replace('<!-- SSR_SCHEMA -->', schema);

    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(html);
  } catch (e) {
    console.error('Model SSR error:', e);
    return res.status(500).send('Internal server error');
  }
};

// Vercel Serverless Function — SSR Article Pages
// Reads article.html template, fetches article from Supabase by slug,
// replaces SSR markers with actual data, returns complete HTML.

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbnBobXZqaWp2aGdyam5lcG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTM1ODYsImV4cCI6MjA5NTM4OTU4Nn0._it7-0Izx-FW6SYvTNvz20v56J7USqmXVOWrEaIStps';

module.exports = async (req, res) => {
  const slug = req.query.slug;
  if (!slug) {
    return res.status(404).send('Not found');
  }

  try {
    // Fetch article from Supabase
    const url = `${SUPABASE_URL}/rest/v1/articles?select=*,categories(name,slug)&slug=eq.${encodeURIComponent(slug)}&eq(published,true)&limit=1`;
    const response = await fetch(url, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
    });

    if (!response.ok) {
      throw new Error('Supabase fetch failed: ' + response.status);
    }

    const data = await response.json();
    const article = data[0];

    if (!article) {
      return res.status(404).send('Article not found');
    }

    // Read article.html template
    const templatePath = path.join(process.cwd(), 'article.html');
    let html = fs.readFileSync(templatePath, 'utf-8');

    const title = article.title || 'Article';
    const description = article.description || '';
    const categoryName = article.categories?.name || 'General';
    const content = article.content || '';
    const image = article.image_url || 'https://toolrankly.com/images/default-og.png';
    const rating = parseFloat(article.rating) || 0;
    const readTime = article.read_time || 5;
    const date = article.created_at ? new Date(article.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
    const canonical = `https://toolrankly.com/article/${encodeURIComponent(slug)}`;

    // Build schema
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: description,
      image: image,
      datePublished: article.created_at,
      dateModified: article.updated_at || article.created_at,
      author: {
        '@type': 'Organization',
        name: 'AI Tools Insider',
        url: 'https://toolrankly.com'
      },
      publisher: {
        '@type': 'Organization',
        name: 'AI Tools Insider',
        url: 'https://toolrankly.com'
      }
    });

    // Build SSR data for client-side hydration
    const ssrData = JSON.stringify({
      id: article.id,
      title: title,
      description: description,
      content: content,
      slug: slug,
      category_id: article.category_id,
      categories: article.categories,
      rating: rating,
      read_time: readTime,
      created_at: article.created_at,
      updated_at: article.updated_at,
      tags: article.tags,
      image_url: image,
    });

    // Replace SSR markers
    html = html.replace('<!-- SSR_TITLE -->', title);
    html = html.replace('<!-- /SSR_TITLE -->', '');
    html = html.replace('<!-- SSR_DESCRIPTION -->', description);
    html = html.replace('<!-- SSR_CANONICAL -->', canonical);
    html = html.replace('<!-- SSR_OG_TITLE -->', title);
    html = html.replace('<!-- SSR_OG_DESC -->', description);
    html = html.replace('<!-- SSR_OG_IMAGE -->', image);
    html = html.replace('<!-- SSR_SCHEMA -->', schema);

    // Embed article data for client-side hydration (before </head>)
    const hydrationScript = `<script id="ssrArticleData" type="application/json">${ssrData}</script>`;
    html = html.replace('</head>', hydrationScript + '\n  </head>');

    // Set cache headers
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');

    return res.status(200).send(html);
  } catch (e) {
    console.error('SSR error:', e);
    return res.status(500).send('Internal server error');
  }
};

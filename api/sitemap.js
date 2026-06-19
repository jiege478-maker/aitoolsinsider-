// Vercel Serverless Function — Dynamic sitemap.xml
module.exports = async (req, res) => {
  const SUPABASE_URL = process.env.SUPABASE_URL || 'https://hgnphmvjijvhgrjnepno.supabase.co';
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbnBobXZqaWp2aGdyam5lcG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTM1ODYsImV4cCI6MjA5NTM4OTU4Nn0._it7-0Izx-FW6SYvTNvz20v56J7USqmXVOWrEaIStps';

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/articles?published=eq.true&select=slug,updated_at,rating`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
      },
    });

    if (!response.ok) throw new Error('Supabase fetch failed: ' + response.status);

    const articles = await response.json();
    const today = new Date().toISOString().slice(0, 10);
    const SITE = 'https://www.toolrankly.com';

    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';

    const staticPages = [
      { loc: `${SITE}/`, priority: '1.0', changefreq: 'daily' },
      { loc: `${SITE}/about.html`, priority: '0.4', changefreq: 'monthly' },
      { loc: `${SITE}/contact.html`, priority: '0.3', changefreq: 'monthly' },
      { loc: `${SITE}/privacy.html`, priority: '0.2', changefreq: 'monthly' },
    ];
    for (const p of staticPages) {
      xml += `  <url>\n    <loc>${p.loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>${p.changefreq}</changefreq>\n    <priority>${p.priority}</priority>\n  </url>\n`;
    }

    for (const a of articles) {
      const mod = (a.updated_at || '').slice(0, 10) || today;
      const slug = encodeURIComponent(a.slug);
      const priority = a.rating && a.rating >= 4.5 ? '0.9' : a.rating && a.rating >= 4.0 ? '0.8' : '0.7';
      xml += `  <url>\n    <loc>${SITE}/article/${slug}</loc>\n    <lastmod>${mod}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${priority}</priority>\n  </url>\n`;
    }

    xml += '</urlset>';

    res.setHeader('Content-Type', 'application/xml;charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(200).send(xml);
  } catch (e) {
    res.status(500).send('<?xml version="1.0"?><error>Failed to generate sitemap</error>');
  }
};

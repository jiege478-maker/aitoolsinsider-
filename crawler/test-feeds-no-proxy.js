/**
 * Test potentially working feeds without proxy
 */
const RssParser = require('rss-parser');
const rssParser = new RssParser({
  timeout: 8000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
  },
});

const feeds = [
  // Timeout ones that might work without proxy
  { url: 'https://news.ycombinator.com/rss', name: 'Hacker News' },
  { url: 'https://medium.com/feed/tag/artificial-intelligence', name: 'Medium AI' },
  { url: 'https://huggingface.co/blog/feed.xml', name: 'HuggingFace Blog' },
  { url: 'https://blog.langchain.dev/feed/', name: 'LangChain' },
  { url: 'https://ai.googleblog.com/feeds/posts/default', name: 'Google AI' },
  { url: 'https://ai.meta.com/blog/feed.xml', name: 'Meta AI' },
  { url: 'https://mistral.ai/feed.xml', name: 'Mistral' },
  // 403 ones
  { url: 'https://www.marktechpost.com/feed/', name: 'MarkTechPost' },
  { url: 'https://www.analyticsvidhya.com/blog/feed/', name: 'Analytics Vidhya' },
  { url: 'https://www.unite.ai/feed/', name: 'Unite AI' },
  { url: 'https://www.artificialintelligence-news.com/feed/', name: 'AI News' },
  // Try alternative URLs
  { url: 'https://www.reddit.com/r/artificial/.rss', name: 'Reddit AI' },
  { url: 'https://www.neptune.ai/feed/', name: 'Neptune AI alt' },
];

async function main() {
  for (const f of feeds) {
    process.stdout.write('  [' + f.name.padEnd(20) + '] ');
    try {
      const result = await rssParser.parseURL(f.url);
      const count = (result.items || []).length;
      console.log('✅ ' + count + ' items');
    } catch (e) {
      const s = e.message.match(/status code (\d+)/);
      if (s) console.log('❌ HTTP ' + s[1]);
      else console.log('❌ ' + e.message.substring(0, 50));
    }
  }
}
main();

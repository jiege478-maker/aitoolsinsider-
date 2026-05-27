/**
 * Test new/alternative feed URLs
 */
const RssParser = require('rss-parser');
const rssParser = new RssParser({
  timeout: 10000,
  headers: { 'User-Agent': 'Mozilla/5.0', 'Accept': 'application/rss+xml,application/xml,text/xml' },
});

const feeds = [
  // Verified working from curl tests
  { url: 'https://openai.com/blog/rss.xml', name: 'OpenAI blog' },
  { url: 'https://openai.com/news/rss.xml', name: 'OpenAI news' },
  { url: 'https://docs.anthropic.com/rss', name: 'Anthropic docs' },
  { url: 'https://blog.google/technology/ai/rss/', name: 'Google AI blog' },
  { url: 'https://deepmind.google/blog/rss.xml', name: 'DeepMind' },
  { url: 'https://cohere.com/blog/rss', name: 'Cohere blog' },
  { url: 'https://www.theverge.com/rss/ai-artificial-intelligence/index.xml', name: 'The Verge AI' },
  { url: 'https://www.langchain.com/blog/rss.xml', name: 'LangChain' },
  { url: 'https://hnrss.org/frontpage', name: 'HN RSS' },
  { url: 'https://www.artificialintelligence-news.com/rss/', name: 'AI News' },
  { url: 'https://aibusiness.com/rss', name: 'AI Business' },
  { url: 'https://github.blog/feed/', name: 'GitHub blog' },
  { url: 'https://azure.microsoft.com/en-us/blog/feed/', name: 'Azure blog' },
  { url: 'https://www.marktechpost.com/feed/', name: 'MarkTechPost' },
];

async function main() {
  for (const f of feeds) {
    process.stdout.write('[' + f.name.padEnd(18) + '] ');
    try {
      const result = await rssParser.parseURL(f.url);
      const items = (result.items || []).length;
      const latest = items > 0 ? (result.items[0].title || '').substring(0, 50) : '(empty)';
      console.log('✅ ' + String(items).padStart(2) + ' items | ' + latest);
    } catch (e) {
      console.log('❌ ' + (e.message || '').substring(0, 60));
    }
  }
}
main();

/**
 * Test all RSS feeds and report their status.
 * Usage: node test-feeds.js
 */
const RssParser = require('rss-parser');
const path = require('path');

// Proxy config (same as crawler)
let PROXY_URL = process.env.HTTP_PROXY || process.env.HTTPS_PROXY || null;
let rssAgent = undefined;
if (PROXY_URL) {
  const { HttpsProxyAgent } = require('https-proxy-agent');
  rssAgent = new HttpsProxyAgent(PROXY_URL);
}

const rssParser = new RssParser({
  timeout: 10000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml',
  },
  requestOptions: rssAgent ? { agent: rssAgent } : {},
});

const FEEDS = [
  // ===== AI Companies =====
  { url: 'https://openai.com/blog/feed.xml', name: 'OpenAI' },
  { url: 'https://www.anthropic.com/feed.xml', name: 'Anthropic' },
  { url: 'https://ai.googleblog.com/feeds/posts/default', name: 'Google AI' },
  { url: 'https://ai.meta.com/blog/feed.xml', name: 'Meta AI' },
  { url: 'https://stability.ai/blog/feed.xml', name: 'Stability AI' },
  { url: 'https://mistral.ai/feed.xml', name: 'Mistral' },
  { url: 'https://cohere.com/blog/feed.xml', name: 'Cohere' },
  // ===== Tech News =====
  { url: 'https://techcrunch.com/category/artificial-intelligence/feed/', name: 'TechCrunch AI' },
  { url: 'https://www.theverge.com/ai-artificial-intelligence/rss.xml', name: 'The Verge AI' },
  { url: 'https://venturebeat.com/category/ai/feed/', name: 'VentureBeat AI' },
  { url: 'https://www.artificialintelligence-news.com/feed/', name: 'AI News' },
  { url: 'https://www.marktechpost.com/feed/', name: 'MarkTechPost' },
  { url: 'https://www.analyticsvidhya.com/blog/feed/', name: 'Analytics Vidhya' },
  { url: 'https://www.technologyreview.com/topic/artificial-intelligence/feed/', name: 'MIT Tech Review' },
  { url: 'https://www.wired.com/feed/tag/ai/latest/rss', name: 'Wired AI' },
  { url: 'https://www.newscientist.com/subject/technology/feed/', name: 'New Scientist' },
  { url: 'https://www.zdnet.com/topic/artificial-intelligence/rss.xml', name: 'ZDNet AI' },
  { url: 'https://analyticsindiamag.com/feed/', name: 'Analytics India Mag' },
  { url: 'https://www.unite.ai/feed/', name: 'Unite AI' },
  // ===== Developer Community =====
  { url: 'https://dev.to/feed/tag/ai', name: 'Dev.to AI' },
  { url: 'https://medium.com/feed/tag/artificial-intelligence', name: 'Medium AI' },
  // ===== Community & Discussion =====
  { url: 'https://www.reddit.com/r/artificial/.rss', name: 'Reddit AI' },
  { url: 'https://www.reddit.com/r/MachineLearning/.rss', name: 'Reddit ML' },
  { url: 'https://news.ycombinator.com/rss', name: 'Hacker News' },
  // ===== AI Tools & Product =====
  { url: 'https://www.producthunt.com/feed?category=artificial-intelligence', name: 'Product Hunt AI' },
  { url: 'https://neptune.ai/blog/feed', name: 'Neptune AI' },
  { url: 'https://www.comet.com/blog/feed/', name: 'Comet' },
  // ===== AI Tutorials & Learning =====
  { url: 'https://www.freecodecamp.org/news/tag/artificial-intelligence/rss/', name: 'freeCodeCamp AI' },
  { url: 'https://www.kdnuggets.com/feed', name: 'KDnuggets' },
  { url: 'https://machinelearningmastery.com/blog/feed/', name: 'ML Mastery' },
  { url: 'https://blog.paperspace.com/feed/', name: 'Paperspace' },
  { url: 'https://www.assemblyai.com/blog/rss/', name: 'AssemblyAI' },
  { url: 'https://blog.langchain.dev/feed/', name: 'LangChain' },
  { url: 'https://www.pinecone.io/blog/feed.xml', name: 'Pinecone' },
  { url: 'https://huggingface.co/blog/feed.xml', name: 'HuggingFace Blog' },
];

async function testFeeds() {
  console.log('Testing', FEEDS.length, 'RSS feeds...\n');

  let working = 0, broken = 0, empty = 0;

  for (const feed of FEEDS) {
    process.stdout.write('  [' + feed.name.padEnd(20) + '] ');
    try {
      const result = await rssParser.parseURL(feed.url);
      const count = (result.items || []).length;
      if (count > 0) {
        const latest = result.items[0].title?.substring(0, 50) || '(no title)';
        console.log('✅ ' + count + ' items | Latest: ' + latest);
        working++;
      } else {
        console.log('⚠️  OK but 0 items');
        empty++;
      }
    } catch (e) {
      const statusMatch = e.message.match(/status code (\d+)/);
      if (statusMatch) {
        console.log('❌ HTTP ' + statusMatch[1]);
      } else {
        console.log('❌ ' + e.message.substring(0, 60));
      }
      broken++;
    }
  }

  console.log('\n=== Summary ===');
  console.log('  Working: ' + working);
  console.log('  Empty:   ' + empty);
  console.log('  Broken:  ' + broken);
}

testFeeds().catch(console.error);

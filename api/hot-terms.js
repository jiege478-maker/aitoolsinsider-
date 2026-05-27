// Vercel Serverless Function — 谷歌 AI 搜索热词
// 利用 Vercel 的 AWS 基础设施访问 Google API

const AI_SEEDS = [
  'AI', 'ChatGPT', 'Claude', 'Gemini', 'DeepSeek',
  'AI Agent', 'AI tools', 'LLM', 'OpenAI', 'AI coding',
  'AI image generator', 'AI video', 'Copilot',
  'Perplexity', 'Midjourney', 'Sora',
];

async function fetchGoogleSuggest(query) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
  const text = await res.text();
  const match = text.match(/\[.*\]/);
  if (!match) return [];
  const data = JSON.parse(match[0]);
  return (data[1] || []).map(s => ({ term: s, source: 'Google Suggest' }));
}

async function fetchGoogleNews() {
  const url = 'https://news.google.com/rss/search?q=AI&hl=en-US&gl=US&ceid=US:en';
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const xml = await res.text();
  const titles = xml.match(/<title>(.*?)<\/title>/g) || [];
  return titles.slice(1, 20).map(t => ({
    term: t.replace(/<\/?title>/g, '').trim(),
    source: 'Google News',
  }));
}

async function fetchGoogleTrends() {
  const url = 'https://trends.google.com/trending/rss?geo=US';
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const xml = await res.text();
  const titles = xml.match(/<title>(.*?)<\/title>/g) || [];
  return titles.slice(1, 20).map(t => ({
    term: t.replace(/<\/?title>/g, '').trim(),
    source: 'Google Trends',
  }));
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // 并行获取所有来源
    const [suggestResults, newsResult, trendsResult] = await Promise.all([
      Promise.allSettled(AI_SEEDS.map(s => fetchGoogleSuggest(s))),
      fetchGoogleNews().catch(() => []),
      fetchGoogleTrends().catch(() => []),
    ]);

    const allTerms = [];

    // Google Suggest 结果
    suggestResults.forEach(result => {
      if (result.status === 'fulfilled') allTerms.push(...result.value);
    });

    // Google News 结果
    allTerms.push(...newsResult);

    // Google Trends 结果
    allTerms.push(...trendsResult);

    // 去重
    const seen = new Set();
    const unique = allTerms.filter(t => {
      const key = t.term.toLowerCase().slice(0, 50).replace(/\s+/g, ' ');
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // AI 相关性检测（精确匹配，避免 airbnb/airpods 等误判）
    const isAiRelated = (term) => {
      const lower = term.toLowerCase();
      // 整词匹配 AI
      if (/\bai\b/.test(lower)) return true;
      // 特定 AI 关键词精确匹配
      const aiPhrases = [
        'artificial intelligence', 'chatgpt', 'claude', 'gemini', 'deepseek',
        'llm', 'openai', 'copilot', 'perplexity', 'midjourney', 'machine learning',
        'gpt-4', 'gpt4', 'gpt 4', 'gpt-5', 'gpt5', 'stable diffusion',
        'prompt engineering', 'large language model', 'neural network',
        'generative ai', 'generative pre.train', 'rag', 'vector database',
        'fine.tuning', 'multimodal', 'sora', 'groq', 'computer vision',
        'natural language', 'deep learning', 'reinforcement learning',
        'transformer model', 'diffusion model', 'augmented generation',
        'agents', 'agentic', 'autogpt', 'langchain', 'llama',
        'mistral', 'phi-3', 'phi-4', 'qwen', 'yi-', 'kimi',
        'doubao', 'tongyi', 'baichuan', 'hunyuan',
      ];
      return aiPhrases.some(p => lower.includes(p));
    };

    // 评分
    const scored = unique.map(t => {
      const ai = isAiRelated(t.term);
      const weight = t.source === 'Google Trends' ? 25
                   : t.source === 'Google Suggest' ? 20
                   : 12;
      return { ...t, isAiRelated: ai, weight };
    });

    // 排序：AI 相关优先 > 权重 > 来源
    scored.sort((a, b) => {
      if (a.isAiRelated !== b.isAiRelated) return a.isAiRelated ? -1 : 1;
      if (a.weight !== b.weight) return b.weight - a.weight;
      return 0;
    });

    return res.status(200).json({
      live: scored.slice(0, 50),
      static: [],
      fetchedAt: Date.now(),
      source: 'Google Trends + Google News + Google Suggest',
      total: scored.length,
    });
  } catch (e) {
    return res.status(200).json({
      live: [],
      static: [],
      fetchedAt: Date.now(),
      source: 'Google Trends + Google News + Google Suggest',
      total: 0,
      error: e.message,
    });
  }
}

// ⚠️ 请替换为你的 Supabase 项目凭证
// 在 https://supabase.com 创建项目后，从 Settings → API 获取
const SUPABASE_URL = 'https://YOUR_PROJECT.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function fetchCategories() {
  const { data, error } = await supabaseClient
    .from('categories')
    .select('*')
    .order('id');
  if (error) throw error;
  return data || [];
}

async function fetchPublishedArticles(categorySlug = null) {
  let query = supabaseClient
    .from('articles')
    .select(`*, categories!inner(name, slug)`)
    .eq('published', true)
    .order('created_at', { ascending: false });

  if (categorySlug) {
    query = query.eq('categories.slug', categorySlug);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function fetchArticleBySlug(slug) {
  const { data, error } = await supabaseClient
    .from('articles')
    .select(`*, categories(name, slug)`)
    .eq('slug', slug)
    .single();
  if (error) return null;
  return data;
}

async function fetchRelatedArticles(categoryId, excludeSlug, limit = 4) {
  const { data, error } = await supabaseClient
    .from('articles')
    .select(`*, categories(name, slug)`)
    .eq('category_id', categoryId)
    .eq('published', true)
    .neq('slug', excludeSlug)
    .limit(limit);
  if (error) return [];
  return data || [];
}

async function fetchFeaturedArticles() {
  const { data, error } = await supabaseClient
    .from('articles')
    .select(`*, categories(name, slug)`)
    .eq('featured', true)
    .eq('published', true)
    .order('created_at', { ascending: false })
    .limit(6);
  if (error) return [];
  return data || [];
}

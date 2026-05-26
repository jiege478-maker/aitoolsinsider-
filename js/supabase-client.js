const SUPABASE_URL = 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbnBobXZqaWp2aGdyam5lcG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTM1ODYsImV4cCI6MjA5NTM4OTU4Nn0._it7-0Izx-FW6SYvTNvz20v56J7USqmXVOWrEaIStps";

var supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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

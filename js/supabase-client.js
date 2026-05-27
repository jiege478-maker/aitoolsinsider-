const SUPABASE_URL = 'https://hgnphmvjijvhgrjnepno.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbnBobXZqaWp2aGdyam5lcG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk4MTM1ODYsImV4cCI6MjA5NTM4OTU4Nn0._it7-0Izx-FW6SYvTNvz20v56J7USqmXVOWrEaIStps';

const SB_HEADERS = {
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
  'Content-Type': 'application/json',
  'Prefer': 'return=representation'
};

async function sbFetch(path, options) {
  const res = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: { ...SB_HEADERS, ...options?.headers }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res;
}

// ---- Auth ----
async function sbLogin(email, password) {
  const res = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  if (!res.ok) throw new Error('Invalid email or password');
  return res.json();
}

async function sbGetSession() {
  const accessToken = localStorage.getItem('sb-access-token');
  const refreshToken = localStorage.getItem('sb-refresh-token');
  if (!accessToken) return null;

  // Check if token is still valid by fetching user
  const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + accessToken }
  });
  if (res.ok) {
    const user = await res.json();
    return { user };
  }

  // Try refresh
  if (!refreshToken) return null;
  try {
    const refreshRes = await fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    });
    if (refreshRes.ok) {
      const data = await refreshRes.json();
      localStorage.setItem('sb-access-token', data.access_token);
      localStorage.setItem('sb-refresh-token', data.refresh_token);
      return { user: data.user };
    }
  } catch(e) {}
  return null;
}

function sbSaveSession(data) {
  localStorage.setItem('sb-access-token', data.access_token);
  localStorage.setItem('sb-refresh-token', data.refresh_token);
}

function sbClearSession() {
  localStorage.removeItem('sb-access-token');
  localStorage.removeItem('sb-refresh-token');
}

// ---- Categories ----
async function fetchCategories() {
  const res = await sbFetch('/rest/v1/categories?select=*&order=id.asc');
  return res.json();
}

// ---- Articles ----
async function fetchPublishedArticles(categorySlug) {
  let url = '/rest/v1/articles?select=*,categories(name,slug)&published=eq.true&order=created_at.desc';
  if (categorySlug) {
    // Map slug to category_id (Supabase REST API can't filter parent by nested column)
    const slugToId = { writing: 1, image: 2, coding: 3, video: 4, productivity: 5 };
    const catId = slugToId[categorySlug];
    if (catId) url += '&category_id=eq.' + catId;
  }
  const res = await sbFetch(url);
  return res.json();
}

async function fetchArticleBySlug(slug) {
  const res = await sbFetch('/rest/v1/articles?select=*,categories(name,slug)&published=eq.true&slug=eq.' + encodeURIComponent(slug) + '&limit=1');
  const data = await res.json();
  return data.length > 0 ? data[0] : null;
}

async function fetchRelatedArticles(categoryId, excludeSlug, limit) {
  const url = '/rest/v1/articles?select=*,categories(name,slug)&category_id=eq.' + categoryId + '&published=eq.true&slug=neq.' + encodeURIComponent(excludeSlug) + '&limit=' + (limit || 4);
  const res = await sbFetch(url);
  return res.json();
}

async function fetchFeaturedArticles() {
  const res = await sbFetch('/rest/v1/articles?select=*,categories(name,slug)&featured=eq.true&published=eq.true&order=created_at.desc&limit=6');
  return res.json();
}

// ---- Admin: Auth'd requests ----
function getAuthHeaders() {
  const token = localStorage.getItem('sb-access-token');
  return {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY),
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
}

async function adminFetch(path, options) {
  const res = await fetch(SUPABASE_URL + path, {
    ...options,
    headers: { ...getAuthHeaders(), ...options?.headers }
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err);
  }
  return res;
}

async function fetchAllArticles() {
  const res = await adminFetch('/rest/v1/articles?select=*,categories(name)&order=created_at.desc');
  return res.json();
}

async function createArticle(data) {
  const res = await adminFetch('/rest/v1/articles', {
    method: 'POST',
    body: JSON.stringify(data)
  });
  return res.json();
}

async function updateArticle(id, data) {
  const res = await adminFetch('/rest/v1/articles?id=eq.' + id, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
  return res.json();
}

async function deleteArticle(id) {
  await adminFetch('/rest/v1/articles?id=eq.' + id, { method: 'DELETE' });
}

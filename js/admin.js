document.addEventListener('DOMContentLoaded', async function() {
  const loginScreen = document.getElementById('loginScreen');
  const dashboardScreen = document.getElementById('dashboardScreen');
  const loginForm = document.getElementById('loginForm');
  const loginError = document.getElementById('loginError');
  const logoutBtn = document.getElementById('logoutBtn');
  const articlesTableBody = document.getElementById('articlesTableBody');
  const newArticleBtn = document.getElementById('newArticleBtn');
  const cancelEditBtn = document.getElementById('cancelEditBtn');
  const editorForm = document.getElementById('editorForm');
  const articlesList = document.getElementById('articlesList');
  const articleForm = document.getElementById('articleForm');
  const formTitle = document.getElementById('formTitle');
  const adminEmail = document.getElementById('adminEmail');
  const toast = document.getElementById('toast');

  let editingArticleId = null;
  let categories = [];

  // ===== Toast =====
  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast ' + type + ' show';
    setTimeout(function() { toast.className = 'toast'; }, 3000);
  }

  // ===== Rich text editor =====
  const editorContent = document.getElementById('editorContent');
  const toolbar = document.getElementById('editorToolbar');

  if (toolbar) {
    toolbar.addEventListener('click', function(e) {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      const cmd = btn.getAttribute('data-cmd');
      if (!cmd) return;
      execFormat(cmd);
    });
  }

  function execFormat(cmd) {
    editorContent.focus();
    switch (cmd) {
      case 'h2':
        document.execCommand('formatBlock', false, '<h2>');
        break;
      case 'h3':
        document.execCommand('formatBlock', false, '<h3>');
        break;
      case 'bold':
        document.execCommand('bold');
        break;
      case 'italic':
        document.execCommand('italic');
        break;
      case 'ul':
        document.execCommand('insertUnorderedList');
        break;
      case 'ol':
        document.execCommand('insertOrderedList');
        break;
      case 'link':
        var url = prompt('Enter URL:');
        if (url) document.execCommand('createLink', false, url);
        break;
      case 'quote':
        document.execCommand('formatBlock', false, '<blockquote>');
        break;
    }
  }

  // ===== Supabase Auth =====
  async function checkSession() {
    const { data: { session }, error } = await supabaseClient.auth.getSession();
    if (session) {
      showDashboard(session.user.email);
    } else {
      showLogin();
    }
  }

  function showLogin() {
    loginScreen.style.display = 'block';
    dashboardScreen.style.display = 'none';
  }

  function showDashboard(email) {
    loginScreen.style.display = 'none';
    dashboardScreen.style.display = 'block';
    adminEmail.textContent = 'Logged in as: ' + email;
  }

  // ===== Login =====
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const email = document.getElementById('email').value;
      const password = document.getElementById('password').value;

      loginError.style.display = 'none';
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (error) {
        loginError.textContent = error.message;
        loginError.style.display = 'block';
        return;
      }

      if (data.session) {
        showDashboard(data.session.user.email);
        loadArticles();
      }
    });
  }

  // ===== Logout =====
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async function() {
      await supabaseClient.auth.signOut();
      showLogin();
    });
  }

  // ===== Load categories =====
  async function loadCategories() {
    try {
      categories = await fetchCategories();
      const select = document.getElementById('articleCategory');
      if (select) {
        select.innerHTML = categories.map(c =>
          '<option value="' + c.id + '">' + c.name + '</option>'
        ).join('');
      }
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  }

  // ===== Load articles =====
  async function loadArticles() {
    if (!articlesTableBody) return;
    articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>';

    try {
      let query = supabaseClient
        .from('articles')
        .select('*, categories(name)')
        .order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) throw error;

      if (!data || data.length === 0) {
        articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No articles yet. Create your first one!</td></tr>';
        return;
      }

      articlesTableBody.innerHTML = data.map(function(a) {
        const status = a.published
          ? '<span class="status-badge published">Published</span>'
          : '<span class="status-badge draft">Draft</span>';
        const rating = parseFloat(a.rating) || 0;
        const date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return '<tr>' +
          '<td><strong>' + escHtml(a.title) + '</strong></td>' +
          '<td>' + escHtml(a.categories?.name || '') + '</td>' +
          '<td>' + status + '</td>' +
          '<td>' + (rating > 0 ? rating.toFixed(1) : '-') + '</td>' +
          '<td>' + date + '</td>' +
          '<td class="actions">' +
          '<button class="edit-btn" data-id="' + a.id + '">Edit</button>' +
          '<button class="delete-btn" data-id="' + a.id + '">Delete</button>' +
          '</td>' +
          '</tr>';
      }).join('');

      // Attach events
      articlesTableBody.querySelectorAll('.edit-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { editArticle(parseInt(this.dataset.id)); });
      });
      articlesTableBody.querySelectorAll('.delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { deleteArticle(parseInt(this.dataset.id)); });
      });

    } catch (e) {
      console.error('Failed to load articles:', e);
      articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#dc2626;">Failed to load articles: ' + escHtml(e.message) + '</td></tr>';
    }
  }

  function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===== Edit article =====
  async function editArticle(id) {
    editingArticleId = id;
    articlesList.style.display = 'none';
    editorForm.style.display = 'block';
    formTitle.textContent = 'Edit Article';

    document.getElementById('articleForm').querySelector('button[type="submit"]').textContent = 'Update Article';

    try {
      const { data, error } = await supabaseClient
        .from('articles')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;
      if (!data) return;

      document.getElementById('articleTitle').value = data.title || '';
      document.getElementById('articleSlug').value = data.slug || '';
      document.getElementById('articleDescription').value = data.description || '';
      document.getElementById('articleCategory').value = data.category_id || '';
      document.getElementById('articleReadTime').value = data.read_time || 5;
      document.getElementById('articleRating').value = data.rating || 0;
      document.getElementById('articleTags').value = (data.tags || []).join(', ');
      document.getElementById('articlePublished').checked = data.published || false;
      document.getElementById('articleFeatured').checked = data.featured || false;

      if (editorContent) {
        editorContent.innerHTML = data.content || '';
      }
    } catch (e) {
      showToast('Failed to load article: ' + e.message, 'error');
      cancelEdit();
    }
  }

  // ===== Delete article =====
  async function deleteArticle(id) {
    if (!confirm('Are you sure you want to delete this article?')) return;

    try {
      const { error } = await supabaseClient.from('articles').delete().eq('id', id);
      if (error) throw error;
      showToast('Article deleted', 'success');
      loadArticles();
    } catch (e) {
      showToast('Failed to delete: ' + e.message, 'error');
    }
  }

  // ===== New article =====
  if (newArticleBtn) {
    newArticleBtn.addEventListener('click', function() {
      editingArticleId = null;
      articlesList.style.display = 'none';
      editorForm.style.display = 'block';
      formTitle.textContent = 'New Article';
      document.getElementById('articleForm').querySelector('button[type="submit"]').textContent = 'Save Article';
      articleForm.reset();
      if (editorContent) editorContent.innerHTML = '';
    });
  }

  // ===== Cancel edit =====
  if (cancelEditBtn) {
    cancelEditBtn.addEventListener('click', cancelEdit);
  }

  function cancelEdit() {
    editingArticleId = null;
    editorForm.style.display = 'none';
    articlesList.style.display = 'block';
  }

  // ===== Save article =====
  if (articleForm) {
    articleForm.addEventListener('submit', async function(e) {
      e.preventDefault();

      const title = document.getElementById('articleTitle').value.trim();
      const slug = document.getElementById('articleSlug').value.trim();
      const description = document.getElementById('articleDescription').value.trim();
      const category_id = parseInt(document.getElementById('articleCategory').value);
      const read_time = parseInt(document.getElementById('articleReadTime').value) || 5;
      const rating = parseFloat(document.getElementById('articleRating').value) || 0;
      const tagsStr = document.getElementById('articleTags').value.trim();
      const tags = tagsStr ? tagsStr.split(',').map(t => t.trim()).filter(Boolean) : [];
      const published = document.getElementById('articlePublished').checked;
      const featured = document.getElementById('articleFeatured').checked;
      const content = editorContent ? editorContent.innerHTML : '';

      if (!title || !slug || !content) {
        showToast('Title, slug, and content are required.', 'error');
        return;
      }

      const articleData = {
        title,
        slug,
        description,
        category_id,
        read_time,
        rating,
        tags,
        published,
        featured,
        content,
        updated_at: new Date().toISOString()
      };

      try {
        if (editingArticleId) {
          const { error } = await supabaseClient.from('articles').update(articleData).eq('id', editingArticleId);
          if (error) throw error;
          showToast('Article updated!', 'success');
        } else {
          articleData.created_at = new Date().toISOString();
          const { error } = await supabaseClient.from('articles').insert(articleData);
          if (error) throw error;
          showToast('Article created!', 'success');
        }

        cancelEdit();
        loadArticles();
      } catch (e) {
        showToast('Error: ' + e.message, 'error');
      }
    });
  }

  // ===== Auto-generate slug from title =====
  const titleInput = document.getElementById('articleTitle');
  const slugInput = document.getElementById('articleSlug');
  if (titleInput && slugInput) {
    titleInput.addEventListener('input', function() {
      if (editingArticleId) return; // Don't auto-update slug when editing
      slugInput.value = titleInput.value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .substring(0, 100);
    });
  }

  // ===== Init =====
  if (loginScreen) {
    // Check URL hash for auth redirect
    const hash = window.location.hash;
    if (hash && hash.includes('access_token')) {
      try {
        await supabaseClient.auth.getSession();
        window.location.hash = '';
      } catch (e) {}
    }

    await loadCategories();
    await checkSession();

    // Listen for auth state changes
    supabaseClient.auth.onAuthStateChange(function(event, session) {
      if (event === 'SIGNED_IN' && session) {
        showDashboard(session.user.email);
        loadArticles();
      } else if (event === 'SIGNED_OUT') {
        showLogin();
      }
    });

    // If already showing dashboard, load articles
    if (dashboardScreen.style.display !== 'none') {
      loadArticles();
    }
  }
});

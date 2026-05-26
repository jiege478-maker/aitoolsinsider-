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

  function showToast(msg, type) {
    toast.textContent = msg;
    toast.className = 'toast ' + type + ' show';
    setTimeout(function() { toast.className = 'toast'; }, 3000);
  }

  function escHtml(str) {
    if (!str) return '';
    var d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  // ===== Rich text editor =====
  var editorContent = document.getElementById('editorContent');
  var toolbar = document.getElementById('editorToolbar');
  if (toolbar) {
    toolbar.addEventListener('click', function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      execCmd(btn.getAttribute('data-cmd'));
    });
  }
  function execCmd(cmd) {
    editorContent.focus();
    switch (cmd) {
      case 'h2': document.execCommand('formatBlock', false, '<h2>'); break;
      case 'h3': document.execCommand('formatBlock', false, '<h3>'); break;
      case 'bold': document.execCommand('bold'); break;
      case 'italic': document.execCommand('italic'); break;
      case 'ul': document.execCommand('insertUnorderedList'); break;
      case 'ol': document.execCommand('insertOrderedList'); break;
      case 'link':
        var url = prompt('Enter URL:');
        if (url) document.execCommand('createLink', false, url);
        break;
      case 'quote': document.execCommand('formatBlock', false, '<blockquote>'); break;
    }
  }

  // ===== Show/hide screens =====
  function showLogin() {
    loginScreen.style.display = 'block';
    dashboardScreen.style.display = 'none';
  }
  function showDashboard(email) {
    loginScreen.style.display = 'none';
    dashboardScreen.style.display = 'block';
    if (adminEmail) adminEmail.textContent = 'Logged in as: ' + email;
  }

  // ===== Login =====
  if (loginForm) {
    loginForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      var email = document.getElementById('email').value;
      var password = document.getElementById('password').value;
      loginError.style.display = 'none';
      try {
        var data = await sbLogin(email, password);
        sbSaveSession(data);
        showDashboard(email);
        loadArticles();
      } catch (err) {
        loginError.textContent = err.message;
        loginError.style.display = 'block';
      }
    });
  }

  // ===== Logout =====
  if (logoutBtn) {
    logoutBtn.addEventListener('click', function() {
      sbClearSession();
      showLogin();
    });
  }

  // ===== Load categories =====
  async function loadCategories() {
    try {
      categories = await fetchCategories();
      var select = document.getElementById('articleCategory');
      if (select) {
        select.innerHTML = categories.map(function(c) {
          return '<option value="' + c.id + '">' + escHtml(c.name) + '</option>';
        }).join('');
      }
    } catch (e) { console.error('loadCategories:', e); }
  }

  // ===== Load articles =====
  async function loadArticles() {
    if (!articlesTableBody) return;
    articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">Loading...</td></tr>';
    try {
      var data = await fetchAllArticles();
      if (!data || data.length === 0) {
        articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--text-muted);">No articles yet. Create your first one!</td></tr>';
        return;
      }
      articlesTableBody.innerHTML = data.map(function(a) {
        var status = a.published
          ? '<span class="status-badge published">Published</span>'
          : '<span class="status-badge draft">Draft</span>';
        var rating = parseFloat(a.rating) || 0;
        var date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
        return '<tr>' +
          '<td><strong>' + escHtml(a.title) + '</strong></td>' +
          '<td>' + escHtml(a.categories?.name || '') + '</td>' +
          '<td>' + status + '</td>' +
          '<td>' + (rating > 0 ? rating.toFixed(1) : '-') + '</td>' +
          '<td>' + date + '</td>' +
          '<td class="actions">' +
          '<button class="edit-btn" data-id="' + a.id + '">Edit</button>' +
          '<button class="delete-btn" data-id="' + a.id + '">Delete</button>' +
          '</td></tr>';
      }).join('');
      articlesTableBody.querySelectorAll('.edit-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { editArticle(parseInt(this.dataset.id)); });
      });
      articlesTableBody.querySelectorAll('.delete-btn').forEach(function(btn) {
        btn.addEventListener('click', function() { deleteArticle(parseInt(this.dataset.id)); });
      });
    } catch (e) {
      articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#dc2626;">Error: ' + escHtml(e.message) + '</td></tr>';
    }
  }

  // ===== Edit article =====
  async function editArticle(id) {
    editingArticleId = id;
    articlesList.style.display = 'none';
    editorForm.style.display = 'block';
    formTitle.textContent = 'Edit Article';
    document.getElementById('articleForm').querySelector('button[type="submit"]').textContent = 'Update Article';
    try {
      var res = await adminFetch('/rest/v1/articles?id=eq.' + id + '&limit=1');
      var data = (await res.json())[0];
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
      if (editorContent) editorContent.innerHTML = data.content || '';
    } catch (e) {
      showToast('Failed to load: ' + e.message, 'error');
      cancelEdit();
    }
  }

  // ===== Delete article =====
  async function deleteArticle(id) {
    if (!confirm('Are you sure you want to delete this article?')) return;
    try {
      await deleteArticle(id);
      showToast('Article deleted', 'success');
      loadArticles();
    } catch (e) { showToast('Delete failed: ' + e.message, 'error'); }
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
      var title = document.getElementById('articleTitle').value.trim();
      var slug = document.getElementById('articleSlug').value.trim();
      var description = document.getElementById('articleDescription').value.trim();
      var category_id = parseInt(document.getElementById('articleCategory').value);
      var read_time = parseInt(document.getElementById('articleReadTime').value) || 5;
      var rating = parseFloat(document.getElementById('articleRating').value) || 0;
      var tagsStr = document.getElementById('articleTags').value.trim();
      var tags = tagsStr ? tagsStr.split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [];
      var published = document.getElementById('articlePublished').checked;
      var featured = document.getElementById('articleFeatured').checked;
      var content = editorContent ? editorContent.innerHTML : '';

      if (!title || !slug || !content) {
        showToast('Title, slug, and content are required.', 'error');
        return;
      }

      var articleData = {
        title: title,
        slug: slug,
        description: description,
        category_id: category_id,
        read_time: read_time,
        rating: rating,
        tags: tags,
        published: published,
        featured: featured,
        content: content,
        updated_at: new Date().toISOString()
      };

      try {
        if (editingArticleId) {
          await updateArticle(editingArticleId, articleData);
          showToast('Article updated!', 'success');
        } else {
          articleData.created_at = new Date().toISOString();
          await createArticle(articleData);
          showToast('Article created!', 'success');
        }
        cancelEdit();
        loadArticles();
      } catch (e) { showToast('Error: ' + e.message, 'error'); }
    });
  }

  // ===== Auto-slug =====
  var titleInput = document.getElementById('articleTitle');
  var slugInput = document.getElementById('articleSlug');
  if (titleInput && slugInput) {
    titleInput.addEventListener('input', function() {
      if (editingArticleId) return;
      slugInput.value = titleInput.value.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 100);
    });
  }

  // ===== Init =====
  if (loginScreen) {
    await loadCategories();
    var session = await sbGetSession();
    if (session) {
      showDashboard(session.user ? session.user.email : 'Admin');
      loadArticles();
    } else {
      showLogin();
    }
  }
});

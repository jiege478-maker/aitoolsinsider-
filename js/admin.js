/* Simple admin JS - no defer timing tricks, just inline at bottom of body */
var AD = {};
var SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhnbnBobXZqaWp2aGdyam5lcG5vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgxMzU4NiwiZXhwIjoyMDk1Mzg5NTg2fQ.Z9V0aHGsrRQjgb4C1F3V4WzfTpGlJUgA34OKI3U09bc';

AD.init = function() {
  AD.loginScreen = document.getElementById('loginScreen');
  AD.dashboardScreen = document.getElementById('dashboardScreen');
  AD.loginForm = document.getElementById('loginForm');
  AD.loginError = document.getElementById('loginError');
  AD.logoutBtn = document.getElementById('logoutBtn');
  AD.articlesTableBody = document.getElementById('articlesTableBody');
  AD.newArticleBtn = document.getElementById('newArticleBtn');
  AD.cancelEditBtn = document.getElementById('cancelEditBtn');
  AD.editorForm = document.getElementById('editorForm');
  AD.articlesList = document.getElementById('articlesList');
  AD.articleForm = document.getElementById('articleForm');
  AD.formTitle = document.getElementById('formTitle');
  AD.adminEmail = document.getElementById('adminEmail');
  AD._toastEl = document.getElementById('toast');
  AD.editorContent = document.getElementById('editorContent');
  AD.toolbar = document.getElementById('editorToolbar');
  AD.editingId = null;
  AD.categories = [];

  if (!AD.loginScreen) return; // Not on admin page

  // Logout
  if (AD.logoutBtn) {
    AD.logoutBtn.onclick = function() {
      localStorage.removeItem('sb-access-token');
      localStorage.removeItem('sb-refresh-token');
      AD.showLogin();
    };
  }

  // New article
  if (AD.newArticleBtn) {
    AD.newArticleBtn.onclick = function() {
      AD.editingId = null;
      AD.articlesList.style.display = 'none';
      AD.editorForm.style.display = 'block';
      AD.formTitle.textContent = 'New Article';
      document.querySelector('#articleForm button[type="submit"]').textContent = 'Save Article';
      AD.articleForm.reset();
      if (AD.editorContent) AD.editorContent.innerHTML = '';
    };
  }

  // Cancel edit
  if (AD.cancelEditBtn) {
    AD.cancelEditBtn.onclick = AD.cancelEdit;
  }

  // Toolbar
  if (AD.toolbar) {
    AD.toolbar.onclick = function(e) {
      var btn = e.target.closest('button');
      if (!btn) return;
      e.preventDefault();
      AD.execCmd(btn.getAttribute('data-cmd'));
    };
  }

  // Slug auto-fill
  var titleInput = document.getElementById('articleTitle');
  var slugInput = document.getElementById('articleSlug');
  if (titleInput && slugInput) {
    titleInput.oninput = function() {
      if (AD.editingId) return;
      slugInput.value = titleInput.value.toLowerCase()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').substring(0, 100);
    };
  }

  // Save article
  if (AD.articleForm) {
    AD.articleForm.onsubmit = function(e) {
      e.preventDefault();
      AD.saveArticle();
    };
  }

  // Check session and init
  AD.checkSession();
};

AD.execCmd = function(cmd) {
  AD.editorContent.focus();
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
    case 'image': AD.insertImage(); break;
    case 'video': AD.insertVideo(); break;
  }
};

AD.insertImage = function() {
  // Create hidden file input once
  if (!AD._imageInput) {
    AD._imageInput = document.createElement('input');
    AD._imageInput.type = 'file';
    AD._imageInput.accept = 'image/*';
    AD._imageInput.style.display = 'none';
    document.body.appendChild(AD._imageInput);

    AD._imageInput.onchange = function() {
      var file = AD._imageInput.files[0];
      if (!file) return;

      var token = localStorage.getItem('sb-access-token');
      if (!token) { AD.toast('Please login first', 'error'); return; }

      // Validate file type
      if (!file.type.startsWith('image/')) {
        AD.toast('Please select an image file', 'error');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        AD.toast('Image too large. Max 5MB.', 'error');
        return;
      }

      // Create unique filename
      var ext = file.name.split('.').pop().replace(/[^a-zA-Z0-9]/g, '');
      var filename = Date.now() + '-' + Math.random().toString(36).substring(2, 6) + '.' + ext;

      AD.toast('Uploading image...', 'info');

      fetch(SUPABASE_URL + '/storage/v1/object/articles/' + filename, {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_SERVICE_KEY,
          'Content-Type': file.type
        },
        body: file
      })
      .then(function(r) {
        if (!r.ok) throw new Error('Upload failed (HTTP ' + r.status + ')');
        var publicUrl = SUPABASE_URL + '/storage/v1/object/public/articles/' + filename;
        AD.editorContent.focus();
        document.execCommand('insertHTML', false, '<p><img src="' + publicUrl + '" alt="" style="max-width:100%;height:auto;border-radius:8px;"></p>');
        AD.toast('Image inserted!', 'success');
      })
      .catch(function(e) {
        AD.toast('Upload error: ' + e.message, 'error');
        console.error('Image upload failed:', e);
      });

      AD._imageInput.value = '';
    };
  }

  AD._imageInput.click();
};

AD.insertVideo = function() {
  var url = prompt('Enter video URL (YouTube, Vimeo, or direct video link):');
  if (!url) return;
  AD.editorContent.focus();
  var embedUrl = url;
  // YouTube watch -> embed
  var ytMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (ytMatch) {
    embedUrl = 'https://www.youtube.com/embed/' + ytMatch[1];
  }
  // YouTube short
  var ytShort = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/);
  if (ytShort) {
    embedUrl = 'https://www.youtube.com/embed/' + ytShort[1];
  }
  // Vimeo
  var vimeoMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vimeoMatch) {
    embedUrl = 'https://player.vimeo.com/video/' + vimeoMatch[1];
  }
  var videoHtml = '<div class="video-container"><iframe src="' + AD.escHtml(embedUrl) + '" frameborder="0" allowfullscreen></iframe></div>';
  document.execCommand('insertHTML', false, videoHtml);
};

AD.showLogin = function() {
  AD.loginScreen.style.display = 'block';
  AD.dashboardScreen.style.display = 'none';
};

AD.showDashboard = function(email) {
  AD.loginScreen.style.display = 'none';
  AD.dashboardScreen.style.display = 'block';
  if (AD.adminEmail) AD.adminEmail.textContent = 'Logged in as: ' + email;
};

AD.cancelEdit = function() {
  AD.editingId = null;
  AD.editorForm.style.display = 'none';
  AD.articlesList.style.display = 'block';
};

AD.toast = function(msg, type) {
  if (!AD._toastEl) return;
  AD._toastEl.textContent = msg;
  AD._toastEl.className = 'toast ' + (type || '') + ' show';
  clearTimeout(AD._toastTimer);
  AD._toastTimer = setTimeout(function() { AD._toastEl.className = 'toast'; }, 3000);
};

AD.checkSession = function() {
  var token = localStorage.getItem('sb-access-token');
  if (!token) {
    AD.showLogin();
    return;
  }
  // Verify token
  fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token }
  })
  .then(function(r) {
    if (r.ok) return r.json();
    throw new Error('Session expired');
  })
  .then(function(user) {
    AD.showDashboard(user.email || 'Admin');
    AD.loadArticles();
  })
  .catch(function() {
    // Try refresh
    var refreshToken = localStorage.getItem('sb-refresh-token');
    if (!refreshToken) { AD.showLogin(); return; }
    return fetch(SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'apikey': SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: refreshToken })
    })
    .then(function(r) { return r.ok ? r.json() : null; })
    .then(function(data) {
      if (data) {
        localStorage.setItem('sb-access-token', data.access_token);
        localStorage.setItem('sb-refresh-token', data.refresh_token);
        AD.showDashboard(data.user ? data.user.email : 'Admin');
        AD.loadArticles();
      } else {
        AD.showLogin();
      }
    })
    .catch(function() { AD.showLogin(); });
  });
};

AD.loadCategories = function() {
  return fetch(SUPABASE_URL + '/rest/v1/categories?select=*&order=id.asc', {
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + SUPABASE_ANON_KEY }
  })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    AD.categories = data || [];
    var select = document.getElementById('articleCategory');
    if (select) {
      select.innerHTML = AD.categories.map(function(c) {
        return '<option value="' + c.id + '">' + AD.escHtml(c.name) + '</option>';
      }).join('');
    }
  })
  .catch(function(e) { console.error('loadCategories error:', e); });
};

AD.loadArticles = function() {
  if (!AD.articlesTableBody) return;
  AD.articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af;">Loading...</td></tr>';

  var token = localStorage.getItem('sb-access-token');
  var headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + (token || SUPABASE_ANON_KEY), 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

  fetch(SUPABASE_URL + '/rest/v1/articles?select=*,categories(name)&order=created_at.desc', { headers: headers })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    if (!data || data.length === 0) {
      AD.articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#9ca3af;">No articles yet.</td></tr>';
      return;
    }
    AD.articlesTableBody.innerHTML = data.map(function(a) {
      var status = a.published ? '<span class="status-badge published">Published</span>' : '<span class="status-badge draft">Draft</span>';
      var rating = parseFloat(a.rating) || 0;
      var date = new Date(a.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      return '<tr><td><strong>' + AD.escHtml(a.title) + '</strong></td><td>' + AD.escHtml(a.categories ? a.categories.name : '') + '</td><td>' + status + '</td><td>' + (rating > 0 ? rating.toFixed(1) : '-') + '</td><td>' + date + '</td><td class="actions"><button class="edit-btn" data-id="' + a.id + '">Edit</button><button class="delete-btn" data-id="' + a.id + '">Delete</button></td></tr>';
    }).join('');
    // Events
    AD.articlesTableBody.querySelectorAll('.edit-btn').forEach(function(b) {
      b.onclick = function() { AD.editArticle(parseInt(this.dataset.id)); };
    });
    AD.articlesTableBody.querySelectorAll('.delete-btn').forEach(function(b) {
      b.onclick = function() { AD.deleteArticle(parseInt(this.dataset.id)); };
    });
  })
  .catch(function(e) {
    AD.articlesTableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:#dc2626;">Error: ' + AD.escHtml(e.message) + '</td></tr>';
  });
};

AD.editArticle = function(id) {
  AD.editingId = id;
  AD.articlesList.style.display = 'none';
  AD.editorForm.style.display = 'block';
  AD.formTitle.textContent = 'Edit Article';
  document.querySelector('#articleForm button[type="submit"]').textContent = 'Update Article';

  var token = localStorage.getItem('sb-access-token');
  var headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };

  fetch(SUPABASE_URL + '/rest/v1/articles?id=eq.' + id + '&limit=1', { headers: headers })
  .then(function(r) { return r.json(); })
  .then(function(data) {
    var a = data[0];
    if (!a) return;
    document.getElementById('articleTitle').value = a.title || '';
    document.getElementById('articleSlug').value = a.slug || '';
    document.getElementById('articleDescription').value = a.description || '';
    document.getElementById('articleCategory').value = a.category_id || '';
    document.getElementById('articleReadTime').value = a.read_time || 5;
    document.getElementById('articleRating').value = a.rating || 0;
    document.getElementById('articleTags').value = (a.tags || []).join(', ');
    document.getElementById('articlePublished').checked = a.published || false;
    document.getElementById('articleFeatured').checked = a.featured || false;
    if (AD.editorContent) AD.editorContent.innerHTML = a.content || '';
  })
  .catch(function(e) {
    AD.toast('Failed to load: ' + e.message, 'error');
    AD.cancelEdit();
  });
};

AD.deleteArticle = function(id) {
  if (!confirm('Delete this article?')) return;
  var token = localStorage.getItem('sb-access-token');
  fetch(SUPABASE_URL + '/rest/v1/articles?id=eq.' + id, {
    method: 'DELETE',
    headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token }
  })
  .then(function() { AD.toast('Deleted!', 'success'); AD.loadArticles(); })
  .catch(function(e) { AD.toast('Error: ' + e.message, 'error'); });
};

AD.saveArticle = function() {
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
  var content = AD.editorContent ? AD.editorContent.innerHTML : '';

  if (!title || !slug || !content) { AD.toast('Title, slug, and content required.', 'error'); return; }

  var data = { title: title, slug: slug, description: description, category_id: category_id, read_time: read_time, rating: rating, tags: tags, published: published, featured: featured, content: content, updated_at: new Date().toISOString() };

  var token = localStorage.getItem('sb-access-token');
  var headers = { 'apikey': SUPABASE_ANON_KEY, 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'Prefer': 'return=representation' };

  if (AD.editingId) {
    fetch(SUPABASE_URL + '/rest/v1/articles?id=eq.' + AD.editingId, {
      method: 'PATCH', headers: headers, body: JSON.stringify(data)
    })
    .then(function() { AD.toast('Updated!', 'success'); AD.cancelEdit(); AD.loadArticles(); })
    .catch(function(e) { AD.toast('Error: ' + e.message, 'error'); });
  } else {
    data.created_at = new Date().toISOString();
    fetch(SUPABASE_URL + '/rest/v1/articles', {
      method: 'POST', headers: headers, body: JSON.stringify(data)
    })
    .then(function() { AD.toast('Created!', 'success'); AD.cancelEdit(); AD.loadArticles(); })
    .catch(function(e) { AD.toast('Error: ' + e.message, 'error'); });
  }
};

AD.escHtml = function(str) {
  if (!str) return '';
  var d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
};

// Load categories on startup
AD.loadCategories();

// Init when DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', AD.init);
} else {
  AD.init();
}

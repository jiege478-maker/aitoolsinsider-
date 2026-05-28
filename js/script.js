document.addEventListener('DOMContentLoaded', async function() {
  // ===== Shared: Mobile nav toggle =====
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function() { nav.classList.toggle('open'); });
    nav.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() { nav.classList.remove('open'); });
    });
  }

  // ===== Shared: Scroll to top =====
  const scrollBtn = document.querySelector('.scroll-top');
  if (scrollBtn) {
    window.addEventListener('scroll', function() {
      scrollBtn.classList.toggle('visible', window.scrollY > 400);
    });
    scrollBtn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // ===== Shared: Reading progress bar =====
  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    window.addEventListener('scroll', function() {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0) progressBar.style.width = Math.min(100, (window.scrollY / h) * 100) + '%';
    });
  }

  // ===== Render star rating =====
  function renderStars(rating) {
    if (!rating || rating === 0) return '';
    const full = Math.floor(rating);
    const half = rating % 1 >= 0.5 ? 1 : 0;
    const empty = 5 - full - half;
    let html = '';
    for (let i = 0; i < full; i++) html += '<svg viewBox="0 0 24 24" fill="#FFD100"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    for (let i = 0; i < half; i++) html += '<svg viewBox="0 0 24 24" fill="#FFD100"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" clip-path="inset(0 50% 0 0)"/><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" fill="none" stroke="#e0e4e8" stroke-width="1"/></svg>';
    for (let i = 0; i < empty; i++) html += '<svg viewBox="0 0 24 24" fill="none" stroke="#e0e4e8" stroke-width="1"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>';
    return html;
  }

  // ===== Render article card =====
  function createArticleCard(article, featured) {
    const categoryName = article.categories?.name || 'General';
    const categorySlug = article.categories?.slug || 'general';
    const excerpt = article.description || '';
    const rating = parseFloat(article.rating) || 0;

    const imageGradients = [
      'linear-gradient(135deg, #0056D2, #002856)',
      'linear-gradient(135deg, #059669, #002856)',
      'linear-gradient(135deg, #7c3aed, #002856)',
      'linear-gradient(135deg, #d97706, #002856)',
      'linear-gradient(135deg, #dc2626, #002856)',
      'linear-gradient(135deg, #0891b2, #002856)'
    ];
    const gradientIndex = article.id % imageGradients.length;

    if (featured) {
      return `
        <div class="featured-card">
          <div class="featured-card-image" style="background:${imageGradients[gradientIndex]}">
            <span class="category-badge">${escHtml(categoryName)}</span>
          </div>
          <div class="featured-card-body">
            <h3><a href="/article/${escHtml(article.slug)}">${truncate(escHtml(article.title), 70)}</a></h3>
            <div class="excerpt">${escHtml(excerpt)}</div>
            <div class="featured-card-meta">
              <span class="rating">${renderStars(rating)}</span>
              <span>${article.read_time || 5} min read</span>
            </div>
          </div>
        </div>`;
    }

    return `
      <div class="article-card">
        <div class="article-card-image" style="background:${imageGradients[gradientIndex]}">
          <span class="category-badge">${escHtml(categoryName)}</span>
        </div>
        <div class="article-card-body">
          <h3><a href="/article/${escHtml(article.slug)}">${escHtml(article.title)}</a></h3>
          <div class="excerpt">${escHtml(excerpt)}</div>
          <div class="article-card-meta">
            <span class="rating">${renderStars(rating)}</span>
            <span>${article.read_time || 5} min read</span>
          </div>
        </div>
      </div>`;
  }

  function escHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function truncate(str, len) {
    if (!str || str.length <= len) return str || '';
    return str.substring(0, len) + '...';
  }

  // ===== Render category section with horizontal scroll =====
  function createCategorySection(category, articles) {
    if (!articles || articles.length === 0) return '';
    const slug = category.slug === 'general' ? '' : category.slug;
    const cards = articles.map(a => createArticleCard(a, false)).join('');
    return `
      <section class="section scroll-section">
        <div class="container">
          <div class="section-header">
            <h2>${escHtml(category.name)}</h2>
            <a href="/?category=${escHtml(slug)}" class="view-all">View All</a>
          </div>
          <div class="scroll-row">${cards}</div>
        </div>
      </section>`;
  }

  // ===== HOMEPAGE LOGIC =====
  const allArticlesGrid = document.getElementById('allArticlesGrid');
  const articleCount = document.getElementById('articleCount');
  const noResults = document.getElementById('noResults');
  const searchInput = document.getElementById('searchInput');

  // Search data — accessible on all pages
  let allArticles = [];

  // Pagination state
  var pageSize = 12;
  var currentPage = 0;

  function renderPage() {
    if (!allArticlesGrid) return;
    var term = searchInput ? searchInput.value.toLowerCase().trim() : '';
    var filtered = term ? allArticles.filter(function(a) {
      return a.title.toLowerCase().includes(term) ||
        (a.description && a.description.toLowerCase().includes(term)) ||
        (a.tags && a.tags.some(function(t) { return t.toLowerCase().includes(term); }));
    }) : allArticles;

    if (filtered.length === 0) {
      allArticlesGrid.innerHTML = '';
      if (noResults) noResults.style.display = 'block';
      if (articleCount) articleCount.textContent = term ? '0 results for "' + term + '"' : '0 articles';
      document.getElementById('prevPageBtn').style.display = 'none';
      document.getElementById('nextPageBtn').style.display = 'none';
      document.getElementById('pageIndicator').textContent = '';
      return;
    }
    if (noResults) noResults.style.display = 'none';

    // Remove duplicates
    var seen = {};
    var unique = [];
    for (var i = 0; i < filtered.length; i++) {
      if (!seen[filtered[i].id]) {
        seen[filtered[i].id] = true;
        unique.push(filtered[i]);
      }
    }

    var totalPages = Math.ceil(unique.length / pageSize);
    if (currentPage >= totalPages) currentPage = totalPages - 1;
    if (currentPage < 0) currentPage = 0;

    var start = currentPage * pageSize;
    var pageItems = unique.slice(start, start + pageSize);

    if (articleCount) {
      articleCount.textContent = term
        ? unique.length + ' results for "' + term + '"'
        : unique.length + ' articles';
    }

    allArticlesGrid.innerHTML = pageItems.map(function(a) { return createArticleCard(a, false); }).join('');

    // Pagination controls
    var prevBtn = document.getElementById('prevPageBtn');
    var nextBtn = document.getElementById('nextPageBtn');
    var indicator = document.getElementById('pageIndicator');

    if (totalPages <= 1) {
      prevBtn.style.display = 'none';
      nextBtn.style.display = 'none';
      indicator.textContent = '';
    } else {
      prevBtn.style.display = '';
      nextBtn.style.display = '';
      indicator.textContent = 'Page ' + (currentPage + 1) + ' of ' + totalPages;
      prevBtn.disabled = currentPage <= 0;
      nextBtn.disabled = currentPage >= totalPages - 1;
    }
  }

  window.changePage = function(delta) {
    currentPage += delta;
    renderPage();
    // Scroll to grid
    if (allArticlesGrid) allArticlesGrid.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  function applySearchFilter() {
    currentPage = 0;
    renderPage();
  }

  // Delegate on document — catches events regardless of DOM replacements
  document.addEventListener('input', function(e) {
    if (e.target && e.target.id === 'searchInput') {
      applySearchFilter();
    }
  });
  document.addEventListener('keyup', function(e) {
    if (e.target && e.target.id === 'searchInput' && !!document.getElementById('allArticlesGrid')) {
      applySearchFilter();
    }
  });
  // Intercept form submit on homepage only
  document.addEventListener('submit', function(e) {
    if (e.target && e.target.id === 'searchForm') {
      if (document.getElementById('allArticlesGrid')) {
        e.preventDefault();
        applySearchFilter();
      }
    }
  });

  if (allArticlesGrid) {
    // Homepage — load data
    var currentFilterCategory = null;

    try {
      // Parse URL filter
      var urlParams = new URLSearchParams(window.location.search);
      currentFilterCategory = urlParams.get('category') || null;

      // Set active nav
      if (currentFilterCategory) {
        document.querySelectorAll('.nav a').forEach(function(link) {
          var filter = link.getAttribute('data-filter');
          if (filter === currentFilterCategory) {
            document.querySelectorAll('.nav a').forEach(function(l) { l.classList.remove('active'); });
            link.classList.add('active');
          }
        });
      }

      // Fetch articles & categories (for nav)
      allArticles = await fetchPublishedArticles(currentFilterCategory);
      var cats = await fetchCategories();
      var catNav = document.getElementById('categoryNav');
      if (catNav && !currentFilterCategory) {
        // Only update nav on article page
      }

      // Render with pagination
      currentPage = 0;
      renderPage();

      // URL search query on page load (e.g. from article page search)
      var searchQuery = urlParams.get('s');
      if (searchQuery && searchInput) {
        searchInput.value = searchQuery;
        applySearchFilter();
      }

      // Re-apply search filter if user typed before data loaded
      if (searchInput && searchInput.value.trim()) {
        applySearchFilter();
      }
    } catch (e) {
      console.error('Failed to load data:', e);
      if (allArticlesGrid) {
        allArticlesGrid.innerHTML = '<div class="no-results">Failed to load articles. Please check your Supabase configuration in /js/supabase-client.js</div>';
      }
    }
  }

  // ===== ARTICLE PAGE LOGIC =====
  const articleTitle = document.getElementById('articleTitle');
  if (articleTitle) {
    // We're on the article page — check for SSR-embedded data first
    const ssrScript = document.getElementById('ssrArticleData');
    let article = null;
    let slug = null;

    if (ssrScript) {
      try { article = JSON.parse(ssrScript.textContent); } catch (e) {}
      if (article) slug = article.slug;
    }

    if (!article) {
      // Client-side: parse slug from URL
      const urlParams = new URLSearchParams(window.location.search);
      slug = urlParams.get('slug');
      if (!slug) {
        // Check clean URL format: /article/some-slug
        const pathMatch = window.location.pathname.match(/^\/article\/(.+)$/);
        if (pathMatch) slug = decodeURIComponent(pathMatch[1]);
      }
    }

    if (!slug) {
      articleTitle.textContent = 'Article not found';
      document.getElementById('articleBody').innerHTML = '<p>The article you\'re looking for does not exist.</p>';
    } else {
      try {
        if (!article) article = await fetchArticleBySlug(slug);
        if (!article) {
          articleTitle.textContent = 'Article not found';
          document.getElementById('articleBody').innerHTML = '<p>The article you\'re looking for does not exist.</p>';
        } else {
          // Update page title and meta
          document.title = article.title + ' - AI Tools Insider';
          document.querySelector('meta[name="description"]').content = article.description || '';
          document.querySelector('link[rel="canonical"]').href = 'https://toolrankly.com/article/' + encodeURIComponent(slug);
          document.querySelector('meta[property="og:title"]').content = article.title;
          document.querySelector('meta[property="og:description"]').content = article.description || '';
          document.querySelector('meta[property="og:url"]').content = 'https://toolrankly.com/article/' + encodeURIComponent(slug);
          document.querySelector('meta[name="twitter:title"]').content = article.title;
          document.querySelector('meta[name="twitter:description"]').content = article.description || '';

          // Schema — build fresh on client side (SSR already has it correct)
          const schemaScript = document.getElementById('schemaArticle');
          if (schemaScript) {
            const schema = {
              '@context': 'https://schema.org',
              '@type': 'Article',
              headline: article.title,
              description: article.description || '',
              image: article.image_url || 'https://toolrankly.com/images/default-og.png',
              datePublished: article.created_at,
              dateModified: article.updated_at || article.created_at,
              author: { '@type': 'Organization', name: 'AI Tools Insider', url: 'https://toolrankly.com' },
              publisher: { '@type': 'Organization', name: 'AI Tools Insider', url: 'https://toolrankly.com' }
            };
            schemaScript.textContent = JSON.stringify(schema);
          }

          // Render article
          const categoryName = article.categories?.name || 'General';
          const rating = parseFloat(article.rating) || 0;

          // Tags
          const tagsDiv = document.getElementById('articleTags');
          if (tagsDiv) {
            const tagTypes = ['tutorial', 'how-to', 'guide'];
            const tagType = tagTypes[article.category_id % tagTypes.length];
            tagsDiv.innerHTML = `<span class="tag tag--${tagType}">${escHtml(categoryName)}</span>`;
          }

          articleTitle.textContent = article.title;

          const categoryEl = document.getElementById('articleCategory');
          if (categoryEl) categoryEl.textContent = categoryName;

          const readTimeEl = document.getElementById('articleReadTime');
          if (readTimeEl) readTimeEl.textContent = (article.read_time || 5) + ' min read';

          const dateEl = document.getElementById('articleDate');
          if (dateEl) {
            const d = new Date(article.created_at);
            dateEl.textContent = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          }

          const ratingEl = document.getElementById('articleRating');
          if (ratingEl) {
            if (rating > 0) {
              ratingEl.innerHTML = renderStars(rating) + ' ' + rating.toFixed(1);
            }
          }

          const bodyEl = document.getElementById('articleBody');
          if (bodyEl) bodyEl.innerHTML = article.content || '<p>No content available.</p>';

          // Breadcrumb category
          const breadcrumbCat = document.getElementById('breadcrumbCategory');
          if (breadcrumbCat) {
            breadcrumbCat.textContent = categoryName;
            breadcrumbCat.href = '/?category=' + (article.categories?.slug || '');
          }
          const breadcrumbTitle = document.getElementById('breadcrumbTitle');
          if (breadcrumbTitle) breadcrumbTitle.textContent = article.title;

          // Related articles
          const relatedContainer = document.getElementById('relatedArticles');
          if (relatedContainer) {
            const related = await fetchRelatedArticles(article.category_id, slug, 4);
            if (related.length > 0) {
              relatedContainer.innerHTML = related.map(r => {
                var t = escHtml(r.title);
                t = t.length > 45 ? t.substring(0, 42) + '...' : t;
                return '<li><a href="/article/' + escHtml(r.slug) + '">' + t + '</a></li>';
              }).join('');
            } else {
              relatedContainer.innerHTML = '<li style="color:var(--text-muted);font-size:13px;">No related articles yet.</li>';
            }
          }

          // Load categories in nav
          const cats = await fetchCategories();
          const catNav = document.getElementById('categoryNav');
          if (catNav) {
            let html = '<li><a href="/">Home</a></li>';
            cats.forEach(c => {
              html += '<li><a href="/?category=' + escHtml(c.slug) + '">' + escHtml(c.name) + '</a></li>';
            });
            catNav.innerHTML = html;
          }
        }
      } catch (e) {
        console.error('Failed to load article:', e);
        articleTitle.textContent = 'Error loading article';
        document.getElementById('articleBody').innerHTML = '<p>Failed to load the article. Please try again later.</p>';
      }
    }
  }

  // ===== Active nav link =====
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav a').forEach(function(link) {
    const href = link.getAttribute('href');
    if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
      link.classList.add('active');
    }
  });
});

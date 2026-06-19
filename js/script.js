document.addEventListener('DOMContentLoaded', async function() {
  // ===== Shared Utilities =====
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function() { nav.classList.toggle('open'); });
    nav.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() { nav.classList.remove('open'); });
    });
  }

  const scrollBtn = document.querySelector('.scroll-top');
  if (scrollBtn) {
    window.addEventListener('scroll', function() {
      scrollBtn.classList.toggle('visible', window.scrollY > 400);
    });
    scrollBtn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  const progressBar = document.getElementById('progressBar');
  if (progressBar) {
    window.addEventListener('scroll', function() {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      if (h > 0) progressBar.style.width = Math.min(100, (window.scrollY / h) * 100) + '%';
    });
  }

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

  function escHtml(str) {
    if (!str) return '';
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function truncate(str, len) {
    if (!str || str.length <= len) return str || '';
    return str.substring(0, len) + '...';
  }

  const catEmoji = { writing: '✍️', image: '🎨', coding: '💻', video: '🎬', productivity: '⚡' };
  const catGradients = {
    writing: 'linear-gradient(135deg, #0056D2, #002856)',
    image: 'linear-gradient(135deg, #7c3aed, #002856)',
    coding: 'linear-gradient(135deg, #059669, #002856)',
    video: 'linear-gradient(135deg, #d97706, #002856)',
    productivity: 'linear-gradient(135deg, #0891b2, #002856)',
  };

  function createToolCard(tool) {
    const catName = tool.categories?.name || 'General';
    const catSlug = tool.categories?.slug || 'general';
    const rating = parseFloat(tool.rating) || 0;
    const grad = catGradients[catSlug] || catGradients.writing;
    return '<div class="article-card">' +
      '<div class="article-card-image" style="background:' + grad + '">' +
        '<span class="category-badge">' + escHtml(catName) + '</span>' +
      '</div>' +
      '<div class="article-card-body">' +
        '<div class="tool-rating">' +
          '<span class="stars">' + renderStars(rating) + '</span> ' + rating.toFixed(1) +
        '</div>' +
        '<h3><a href="/article/' + escHtml(tool.slug) + '">' + escHtml(tool.title) + '</a></h3>' +
        '<div class="excerpt">' + escHtml(tool.description || '') + '</div>' +
        '<div class="article-card-meta">' +
          '<span class="rating">' + renderStars(rating) + '</span>' +
          '<span>' + (catEmoji[catSlug] || '') + ' ' + escHtml(catName) + '</span>' +
        '</div>' +
      '</div>' +
    '</div>';
  }

  // ===== HOMEPAGE =====
  const topToolsGrid = document.getElementById('topToolsGrid');
  const categorySections = document.getElementById('categorySections');
  const categoryLinks = document.getElementById('categoryLinks');
  const heroSearch = document.getElementById('heroSearchInput');
  const searchInput = document.getElementById('searchInput');

  if (topToolsGrid || categorySections) {
    // Homepage
    try {
      // Fetch all data
      var cats = await fetchCategories();

      // Load nav
      var catNav = document.getElementById('categoryNav');
      if (catNav) {
        var html = '<li><a href="/">Home</a></li>';
        cats.forEach(function(c) { html += '<li><a href="/?category=' + escHtml(c.slug) + '">' + escHtml(c.name) + '</a></li>'; });
        catNav.innerHTML = html;
      }

      // Footer categories
      var footerCats = document.getElementById('footerCategories');
      if (footerCats) {
        var fhtml = '<li><a href="/">Home</a></li>';
        cats.forEach(function(c) { fhtml += '<li><a href="/?category=' + escHtml(c.slug) + '">' + escHtml(c.name) + '</a></li>'; });
        footerCats.innerHTML = fhtml;
      }

      // Category links in hero
      if (categoryLinks) {
        var lhtml = '';
        cats.forEach(function(c) {
          lhtml += '<a href="/?category=' + escHtml(c.slug) + '" class="category-link">' + (catEmoji[c.slug] || '') + ' ' + escHtml(c.name) + '</a>';
        });
        categoryLinks.innerHTML = lhtml;
      }

      // Top rated tools
      if (topToolsGrid) {
        var topTools = await fetchTopRated(9);
        if (topTools && topTools.length > 0) {
          topToolsGrid.innerHTML = topTools.map(createToolCard).join('');
        } else {
          topToolsGrid.innerHTML = '<div class="no-results">No tools found yet. Check back soon.</div>';
        }
      }

      // Category sections
      if (categorySections) {
        var allHtml = '';
        for (var i = 0; i < cats.length; i++) {
          var c = cats[i];
          var tools = await fetchArticlesByCategory(c.slug, 6);
          if (tools && tools.length > 0) {
            allHtml += '<section class="section scroll-section">' +
              '<div class="section-header">' +
                '<h2>' + escHtml(c.name) + '</h2>' +
                '<a href="/?category=' + escHtml(c.slug) + '" class="view-all">View All</a>' +
              '</div>' +
              '<div class="scroll-row">' + tools.map(createToolCard).join('') + '</div>' +
            '</section>';
          }
        }
        categorySections.innerHTML = allHtml || '<div class="no-results">No tools found.</div>';
      }
    } catch (e) {
      console.error('Homepage error:', e);
      if (topToolsGrid) topToolsGrid.innerHTML = '<div class="no-results">Failed to load tools. Please try again later.</div>';
    }
  }

  // Hero search on homepage
  if (heroSearch) {
    heroSearch.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && heroSearch.value.trim()) {
        window.location.href = '/?s=' + encodeURIComponent(heroSearch.value.trim());
      }
    });
  }

  // ===== ARTICLE PAGE =====
  const articleTitle = document.getElementById('articleTitle');
  if (articleTitle) {
    const ssrScript = document.getElementById('ssrArticleData');
    let article = null;
    let slug = null;

    if (ssrScript) {
      try { article = JSON.parse(ssrScript.textContent); } catch (e) {}
      if (article) slug = article.slug;
    }

    if (!article) {
      const urlParams = new URLSearchParams(window.location.search);
      slug = urlParams.get('slug');
      if (!slug) {
        const pathMatch = window.location.pathname.match(/^\/article\/(.+)$/);
        if (pathMatch) slug = decodeURIComponent(pathMatch[1]);
      }
    }

    if (!slug) {
      articleTitle.textContent = 'Tool not found';
      document.getElementById('articleBody').innerHTML = '<p>The tool you\'re looking for does not exist.</p>';
    } else {
      try {
        if (!article) article = await fetchArticleBySlug(slug);
        if (!article) {
          articleTitle.textContent = 'Tool not found';
          document.getElementById('articleBody').innerHTML = '<p>The tool you\'re looking for does not exist.</p>';
        } else {
          // Update page meta
          document.title = article.title + ' - AI Tools Insider';
          var metaDesc = document.querySelector('meta[name="description"]');
          if (metaDesc) metaDesc.content = article.description || '';

          // Category & tags
          const categoryName = article.categories?.name || 'General';

          document.getElementById('articleTags').innerHTML = '<span class="tag tag--guide">' + escHtml(categoryName) + '</span>';
          articleTitle.textContent = article.title;

          const categoryEl = document.getElementById('articleCategory');
          if (categoryEl) categoryEl.textContent = categoryName;

          const dateEl = document.getElementById('articleDate');
          if (dateEl) {
            const d = new Date(article.created_at);
            dateEl.textContent = d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
          }

          // Rating
          const ratingVal = parseFloat(article.rating) || 0;
          const ratingEl = document.getElementById('articleRating');
          if (ratingEl && ratingVal > 0) {
            ratingEl.innerHTML = renderStars(ratingVal) + ' ' + ratingVal.toFixed(1);
          }

          // Pricing — extract from content (first <p> after pricing section)
          const pricingEl = document.getElementById('toolPricing');
          if (pricingEl) {
            var pricingMatch = article.content && article.content.match(/<p[^>]*>([^<]*(?:Free|$\d+|mo|month)[^<]*)<\/p>/i);
            if (pricingMatch) {
              pricingEl.textContent = pricingMatch[1];
            } else {
              document.getElementById('toolPricingDisplay').style.display = 'none';
            }
          }

          // Website URL
          var wsMatch = article.content && article.content.match(/href="(https?:\/\/[^"]+)"/);
          var wsUrl = wsMatch ? wsMatch[1] : '#';
          var wsLink = document.getElementById('toolWebsiteUrl');
          if (wsLink) wsLink.href = wsUrl;

          // Breadcrumb
          const breadcrumbCat = document.getElementById('breadcrumbCategory');
          if (breadcrumbCat) {
            breadcrumbCat.textContent = categoryName;
            breadcrumbCat.href = '/?category=' + (article.categories?.slug || '');
          }
          const breadcrumbTitle = document.getElementById('breadcrumbTitle');
          if (breadcrumbTitle) breadcrumbTitle.textContent = article.title;

          // Body
          const bodyEl = document.getElementById('articleBody');
          if (bodyEl) bodyEl.innerHTML = article.content || '<p>No information available.</p>';

          // Related
          const relatedContainer = document.getElementById('relatedArticles');
          if (relatedContainer) {
            const related = await fetchRelatedArticles(article.category_id, slug, 6);
            if (related.length > 0) {
              relatedContainer.innerHTML = related.map(function(r) {
                var t = escHtml(r.title);
                t = t.length > 45 ? t.substring(0, 42) + '...' : t;
                return '<li><a href="/article/' + escHtml(r.slug) + '">' + t + '</a></li>';
              }).join('');
            } else {
              relatedContainer.innerHTML = '<li style="color:var(--text-muted);font-size:13px;">No related tools yet.</li>';
            }
          }

          // Load nav
          const cats = await fetchCategories();
          const catNav = document.getElementById('categoryNav');
          if (catNav) {
            let h = '<li><a href="/">Home</a></li>';
            cats.forEach(function(c) { h += '<li><a href="/?category=' + escHtml(c.slug) + '">' + escHtml(c.name) + '</a></li>'; });
            catNav.innerHTML = h;
          }

          // Footer categories
          var footerCats = document.getElementById('footerCategories');
          if (footerCats) {
            var fh = '<li><a href="/">Home</a></li>';
            cats.forEach(function(c) { fh += '<li><a href="/?category=' + escHtml(c.slug) + '">' + escHtml(c.name) + '</a></li>'; });
            footerCats.innerHTML = fh;
          }
        }
      } catch (e) {
        console.error('Failed to load tool:', e);
        articleTitle.textContent = 'Error loading tool';
        document.getElementById('articleBody').innerHTML = '<p>Failed to load the tool. Please try again later.</p>';
      }
    }
  }

  // ===== Active nav =====
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav a').forEach(function(link) {
    const href = link.getAttribute('href');
    if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
      link.classList.add('active');
    }
  });
});

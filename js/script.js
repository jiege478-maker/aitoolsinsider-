// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.querySelector('.nav-toggle');
  const nav = document.querySelector('.nav');
  if (toggle && nav) {
    toggle.addEventListener('click', function() {
      nav.classList.toggle('open');
    });
    nav.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        nav.classList.remove('open');
      });
    });
  }

  // Scroll to top
  const scrollBtn = document.querySelector('.scroll-top');
  if (scrollBtn) {
    window.addEventListener('scroll', function() {
      scrollBtn.classList.toggle('visible', window.scrollY > 400);
    });
    scrollBtn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Active nav link
  const currentPath = window.location.pathname;
  document.querySelectorAll('.nav a').forEach(function(link) {
    const href = link.getAttribute('href');
    if (href === currentPath || (href !== '/' && currentPath.startsWith(href))) {
      link.classList.add('active');
    }
  });

  // Category filtering on homepage
  var filterLinks = document.querySelectorAll('.nav a[data-filter]');
  var articles = document.querySelectorAll('.post-card');

  if (filterLinks.length > 0 && articles.length > 0) {
    filterLinks.forEach(function(link) {
      link.addEventListener('click', function(e) {
        e.preventDefault();
        var filter = this.getAttribute('data-filter');

        filterLinks.forEach(function(l) { l.classList.remove('active'); });
        this.classList.add('active');

        articles.forEach(function(article) {
          if (filter === 'all') {
            article.style.display = '';
            return;
          }
          var tag = article.getAttribute('data-tag');
          var topics = article.getAttribute('data-topics') || '';
          var match = false;
          if (filter === 'comparisons' && tag === 'comparison') match = true;
          else if (topics.split(',').indexOf(filter) !== -1) match = true;
          article.style.display = match ? '' : 'none';
        });

        // Scroll to posts section
        var postsSection = document.querySelector('.posts');
        if (postsSection) {
          var y = postsSection.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      });
    });

    // Reset filter when clicking the site logo
    var logo = document.querySelector('.logo');
    if (logo) {
      logo.addEventListener('click', function() {
        setTimeout(function() {
          filterLinks.forEach(function(l) { l.classList.remove('active'); });
          var homeLink = document.querySelector('.nav a[data-filter="all"]');
          if (homeLink) homeLink.classList.add('active');
          articles.forEach(function(a) { a.style.display = ''; });
        }, 50);
      });
    }
  }
});

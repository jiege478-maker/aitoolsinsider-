// Mobile nav toggle
document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.querySelector('.nav-toggle');
  const navLinks = document.querySelector('.nav-links');
  if (toggle && navLinks) {
    toggle.addEventListener('click', function() {
      navLinks.classList.toggle('open');
    });
    // Close nav on link click
    navLinks.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        navLinks.classList.remove('open');
      });
    });
  }

  // Scroll to top button
  var scrollBtn = document.querySelector('.scroll-top');
  if (scrollBtn) {
    window.addEventListener('scroll', function() {
      if (window.scrollY > 400) {
        scrollBtn.classList.add('visible');
      } else {
        scrollBtn.classList.remove('visible');
      }
    });
    scrollBtn.addEventListener('click', function() {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // Table wrapper for responsive tables
  document.querySelectorAll('.article-body table').forEach(function(table) {
    var wrapper = document.createElement('div');
    wrapper.className = 'table-wrap';
    table.parentNode.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  // Copy link to headline
  document.querySelectorAll('.article-body h2, .article-body h3').forEach(function(heading) {
    if (heading.id) {
      heading.style.cursor = 'pointer';
      heading.addEventListener('click', function() {
        var url = window.location.href.split('#')[0] + '#' + this.id;
        navigator.clipboard.writeText(url).then(function() {
          // brief visual feedback
          var orig = this.style.color;
          this.style.color = '#2563eb';
          setTimeout(function() {
            this.style.color = orig;
          }.bind(this), 600);
        }.bind(this));
      });
    }
  });
});

// Google AdSense - replace with your publisher ID
window.adsbygoogle = window.adsbygoogle || [];

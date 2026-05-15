const fs = require('fs');
const path = require('path');

// Inject consent management into all HTML files

const CONSENT_INLINE = `<script>
window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied',analytics_storage:'denied',functionality_storage:'denied',personalization_storage:'denied',security_storage:'granted',wait_for_update:500});
</script>`;

const CONSENT_SCRIPT = `<script defer src="/js/consent.js"></script>`;

function injectConsent(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  const orig = content;

  // Skip if already injected
  if (content.includes('consent.js') || content.includes('consent.default')) return false;

  // 1. Add inline consent default before AdSense script
  content = content.replace(
    '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js',
    CONSENT_INLINE + '\n  ' + '<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js'
  );

  // 2. Add consent.js before </body>
  content = content.replace('</body>', CONSENT_SCRIPT + '\n</body>');

  if (content !== orig) {
    fs.writeFileSync(filePath, content);
    return true;
  }
  return false;
}

// Process all HTML files
const dir = 'articles';
let count = 0;

// Homepage & static pages
['index.html', 'about.html', 'contact.html', 'privacy.html'].forEach(f => {
  if (fs.existsSync(f) && injectConsent(f)) {
    console.log('  ' + f);
    count++;
  }
});

// Articles
fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(f => {
  if (injectConsent(path.join(dir, f))) {
    console.log('  articles/' + f);
    count++;
  }
});

console.log(`\nConsent banner injected into ${count} files`);

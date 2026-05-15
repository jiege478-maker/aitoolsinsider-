/**
 * GDPR Cookie Consent Banner + Google Consent Mode v2
 * Lightweight, self-hosted, no external dependencies
 */
(function() {
  'use strict';

  // ----- Consent State -----
  const CONSENT_KEY = 'ai-tools-insider-consent';

  function getConsent() {
    try {
      const v = localStorage.getItem(CONSENT_KEY);
      return v ? JSON.parse(v) : null;
    } catch { return null; }
  }

  function setConsent(state) {
    localStorage.setItem(CONSENT_KEY, JSON.stringify(state));
  }

  // ----- Google Consent Mode v2 -----
  window.dataLayer = window.dataLayer || [];
  function gtag() { dataLayer.push(arguments); }

  // Default: deny all until consent given
  gtag('consent', 'default', {
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
    analytics_storage: 'denied',
    functionality_storage: 'denied',
    personalization_storage: 'denied',
    security_storage: 'granted',
    wait_for_update: 500
  });

  // If consent already given, apply it
  const existing = getConsent();
  if (existing) {
    if (existing.marketing) {
      gtag('consent', 'update', {
        ad_storage: 'granted',
        ad_user_data: 'granted',
        ad_personalization: 'granted'
      });
    }
    if (existing.analytics) {
      gtag('consent', 'update', {
        analytics_storage: 'granted'
      });
    }
    gtag('consent', 'update', {
      functionality_storage: 'granted',
      personalization_storage: 'granted',
      security_storage: 'granted'
    });
    // Don't show banner
    return;
  }

  // ----- Show Banner -----
  function showBanner() {
    // Remove any existing banner
    const old = document.getElementById('consent-banner');
    if (old) old.remove();

    const banner = document.createElement('div');
    banner.id = 'consent-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Cookie Consent');
    banner.innerHTML = `
      <div class="consent-banner-content">
        <div class="consent-banner-text">
          <strong>We Value Your Privacy</strong>
          <p>We use cookies and similar technologies to enhance your browsing experience, serve personalized ads, and analyze traffic. You can choose which cookies to allow.</p>
        </div>
        <div class="consent-banner-actions">
          <button class="consent-btn consent-btn--settings" id="consentSettings" aria-label="Customize settings">Customize</button>
          <button class="consent-btn consent-btn--reject" id="consentReject" aria-label="Reject all cookies">Reject All</button>
          <button class="consent-btn consent-btn--accept" id="consentAccept" aria-label="Accept all cookies">Accept All</button>
        </div>
        <div class="consent-details" id="consentDetails" style="display:none;">
          <label class="consent-toggle">
            <input type="checkbox" checked disabled> Necessary (Required)
          </label>
          <label class="consent-toggle">
            <input type="checkbox" id="consentAnalytics" checked> Analytics
          </label>
          <label class="consent-toggle">
            <input type="checkbox" id="consentMarketing" checked> Marketing (Personalized Ads)
          </label>
        </div>
        <div class="consent-banner-footer">
          <a href="/privacy.html">Privacy Policy</a>
        </div>
      </div>
    `;

    document.body.appendChild(banner);

    // Force reflow for animation
    requestAnimationFrame(function() {
      banner.style.transform = 'translateY(0)';
      banner.style.opacity = '1';
    });

    // Accept all
    document.getElementById('consentAccept').addEventListener('click', function() {
      const analytics = document.getElementById('consentAnalytics');
      const marketing = document.getElementById('consentMarketing');
      const state = {
        necessary: true,
        analytics: analytics ? analytics.checked : true,
        marketing: marketing ? marketing.checked : true,
        timestamp: Date.now()
      };
      applyConsent(state);
    });

    // Reject all
    document.getElementById('consentReject').addEventListener('click', function() {
      const state = {
        necessary: true,
        analytics: false,
        marketing: false,
        timestamp: Date.now()
      };
      applyConsent(state);
    });

    // Toggle custom settings
    document.getElementById('consentSettings').addEventListener('click', function() {
      const details = document.getElementById('consentDetails');
      const isVisible = details.style.display !== 'none';
      details.style.display = isVisible ? 'none' : 'block';
      this.textContent = isVisible ? 'Customize' : 'Confirm';
      if (!isVisible) {
        // Change button to confirm
        this.id = 'consentConfirm';
        this.textContent = 'Confirm Settings';
      } else {
        this.id = 'consentSettings';
        this.textContent = 'Customize';
      }
    });
  }

  function applyConsent(state) {
    setConsent(state);

    gtag('consent', 'update', {
      ad_storage: state.marketing ? 'granted' : 'denied',
      ad_user_data: state.marketing ? 'granted' : 'denied',
      ad_personalization: state.marketing ? 'granted' : 'denied',
      analytics_storage: state.analytics ? 'granted' : 'denied',
      functionality_storage: 'granted',
      personalization_storage: state.marketing ? 'granted' : 'denied',
      security_storage: 'granted'
    });

    // Hide banner with animation
    const banner = document.getElementById('consent-banner');
    if (banner) {
      banner.style.transform = 'translateY(100%)';
      banner.style.opacity = '0';
      setTimeout(function() { banner.remove(); }, 400);
    }

    // Reload page to activate AdSense with proper consent
    if (window.adsbygoogle && window.adsbygoogle.push) {
      // If using auto-ads, they should pick up the new consent state
    }
  }

  // Show banner when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', showBanner);
  } else {
    showBanner();
  }
})();

// Language switch and contact details for privacy.html, support.html, terms.html and delete-account.html.
// Reads BRAND, BRAND_EN, SUPPORT_WHATSAPP and SUPPORT_EMAIL from config.js. The language is shared with the
// landing page ("sina-lang"): ?lang=, then the visitor's choice, then the browser (Arabic for Arabic browsers).
(function () {
  const C = window.CONFIG || {};
  const wa = /^\d{8,15}$/.test(C.SUPPORT_WHATSAPP || '') ? C.SUPPORT_WHATSAPP : '';
  const email = /@/.test(C.SUPPORT_EMAIL || '') ? C.SUPPORT_EMAIL : '';
  const get = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };

  function fill(lang) {
    const brand = (lang === 'ar' ? C.BRAND : C.BRAND_EN) || C.BRAND_EN || C.BRAND || (lang === 'ar' ? 'سنة' : 'Sina');
    document.querySelectorAll('[data-brand]').forEach(el => { el.textContent = brand; });
    document.querySelectorAll('a.brand').forEach(el => { el.href = 'index.html'; });
    document.querySelectorAll('[data-wa]').forEach(el => {
      if (!wa) { el.hidden = true; return; }
      const text = el.getAttribute('data-wa');
      el.href = 'https://wa.me/' + wa + (text ? '?text=' + encodeURIComponent(text) : '');
      el.hidden = false;
    });
    document.querySelectorAll('[data-email]').forEach(el => {
      if (!email) { el.hidden = true; return; }
      el.href = 'mailto:' + email + (el.getAttribute('data-email') ? '?subject=' + encodeURIComponent(el.getAttribute('data-email')) : '');
      if (!el.children.length && !el.textContent.trim()) el.textContent = email;
      el.hidden = false;
    });
    // the support email in running text: the real address, or a clearly marked placeholder until config.js has one
    document.querySelectorAll('[data-email-text]').forEach(el => {
      el.textContent = email || (lang === 'ar' ? '[بريد الدعم: يُضاف قريباً]' : '[support email: to be added]');
      el.classList.toggle('placeholder', !email);
    });
    document.querySelectorAll('[data-wa-number]').forEach(el => { el.textContent = wa ? '+' + wa : ''; el.hidden = !wa; });
    const y = new Date().getFullYear();
    document.querySelectorAll('[data-year]').forEach(el => { el.textContent = lang === 'ar' ? y.toLocaleString('ar-KW', { useGrouping: false }) : y; });
  }

  function show(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('article[lang]').forEach(a => { a.hidden = a.lang !== lang; });
    document.querySelectorAll('.langs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    document.querySelectorAll('button.lang').forEach(b => {
      b.textContent = lang === 'ar' ? 'English' : 'العربية'; b.lang = lang === 'ar' ? 'en' : 'ar';
      b.setAttribute('aria-label', lang === 'ar' ? 'Show this page in English' : 'اعرض الصفحة بالعربي');
    });
    const t = document.querySelector(`article[lang="${lang}"] h1`);
    if (t) document.title = t.textContent + ' · ' + ((lang === 'ar' ? C.BRAND : C.BRAND_EN) || (lang === 'ar' ? 'سنة' : 'Sina'));
    fill(lang);
    try { localStorage.setItem('sina-lang', lang); } catch (e) { /* private mode */ }
    current = lang;
  }

  let current = 'en';
  const q = new URLSearchParams(location.search).get('lang');
  const saved = get('sina-lang') || get('legal-lang');
  const start = q === 'en' || q === 'ar' ? q : saved === 'en' || saved === 'ar' ? saved : ((navigator.language || '').startsWith('ar') ? 'ar' : 'en');
  document.querySelectorAll('.langs button').forEach(b => b.addEventListener('click', () => show(b.dataset.lang)));
  document.querySelectorAll('button.lang').forEach(b => b.addEventListener('click', () => show(current === 'ar' ? 'en' : 'ar')));
  show(start);
})();

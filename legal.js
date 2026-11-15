// Language switch and contact details for privacy.html, support.html and delete-account.html.
// Reads BRAND, BRAND_EN, SUPPORT_WHATSAPP and SUPPORT_EMAIL from config.js.
(function () {
  const C = window.CONFIG || {};
  const wa = /^\d{8,15}$/.test(C.SUPPORT_WHATSAPP || '') ? C.SUPPORT_WHATSAPP : '';
  const email = /@/.test(C.SUPPORT_EMAIL || '') ? C.SUPPORT_EMAIL : '';

  function fill(lang) {
    const brand = (lang === 'ar' ? C.BRAND : C.BRAND_EN) || C.BRAND_EN || C.BRAND || (lang === 'ar' ? 'خدمة الدعوات' : 'our invitations service');
    document.querySelectorAll('[data-brand]').forEach(el => { el.textContent = brand; });
    document.querySelectorAll('[data-wa]').forEach(el => {
      if (!wa) { el.hidden = true; return; }
      const text = el.getAttribute('data-wa');
      el.href = 'https://wa.me/' + wa + (text ? '?text=' + encodeURIComponent(text) : '');
    });
    document.querySelectorAll('[data-email]').forEach(el => {
      if (!email) { el.hidden = true; return; }
      el.href = 'mailto:' + email + (el.getAttribute('data-email') ? '?subject=' + encodeURIComponent(el.getAttribute('data-email')) : '');
      if (!el.children.length && !el.textContent.trim()) el.textContent = email;
    });
    document.querySelectorAll('[data-wa-number]').forEach(el => { el.textContent = wa ? '+' + wa : ''; el.hidden = !wa; });
  }

  function show(lang) {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
    document.querySelectorAll('article[lang]').forEach(a => { a.hidden = a.lang !== lang; });
    document.querySelectorAll('.langs button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === lang)));
    const t = document.querySelector(`article[lang="${lang}"] h1`);
    if (t) document.title = t.textContent;
    fill(lang);
    try { localStorage.setItem('legal-lang', lang); } catch (e) { /* private mode */ }
  }

  const q = new URLSearchParams(location.search).get('lang');
  let saved = null; try { saved = localStorage.getItem('legal-lang'); } catch (e) { /* ignore */ }
  const start = q === 'en' || q === 'ar' ? q : saved || ((navigator.language || '').startsWith('ar') ? 'ar' : 'en');
  document.querySelectorAll('.langs button').forEach(b => b.addEventListener('click', () => show(b.dataset.lang)));
  show(start);
})();

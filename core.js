// Shared helpers for every page. Loaded after supabase-js and config.js.
(function () {
  const C = window.CONFIG;
  const configured = C && !/YOUR-/.test(C.SUPABASE_URL + C.SUPABASE_ANON_KEY);
  const sb = configured ? window.supabase.createClient(C.SUPABASE_URL, C.SUPABASE_ANON_KEY) : null;

  const $ = s => document.querySelector(s);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function toast(t) {
    let el = $('#toast');
    if (!el) { el = document.createElement('div'); el.id = 'toast'; el.className = 'toast'; el.setAttribute('role', 'status'); document.body.appendChild(el); }
    el.textContent = t; el.classList.add('on');
    clearTimeout(toast.t); toast.t = setTimeout(() => el.classList.remove('on'), 2200);
  }

  // Phones: store digits with country code. 8-digit numbers are treated as Kuwaiti.
  function normPhone(p) {
    let d = String(p || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 8) d = '965' + d;
    return d;
  }
  const showPhone = p => (p || '').startsWith('965') && p.length === 11 ? p.slice(3) : '+' + p;

  // Dates: everything is shown in Kuwait time.
  const TZ = 'Asia/Kuwait';
  // Back-office pages show Western digits in Arabic too (like phones and counts); the guest page keeps Arabic digits.
  const backOffice = () => !!(document.body && document.body.classList.contains('app'));
  const loc = (lang, kind) => lang === 'en' ? (kind === 'd' ? 'en-GB' : 'en-US') : backOffice() ? 'ar-KW-u-nu-latn' : 'ar-KW';
  function fmtDate(iso, lang) {
    if (!iso) return '';
    return new Date(iso).toLocaleDateString(loc(lang, 'd'), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
  function fmtTime(iso, lang) {
    if (!iso) return '';
    return new Date(iso).toLocaleTimeString(loc(lang, 't'), { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
  }
  // From a date + time typed in Kuwait time to an ISO string (Kuwait is UTC+3 all year).
  const kwToIso = (date, time) => date ? new Date(`${date}T${time || '20:00'}:00+03:00`).toISOString() : null;
  function isoToKw(iso) {
    if (!iso) return { date: '', time: '' };
    const d = new Date(new Date(iso).getTime() + 3 * 3600e3).toISOString();
    return { date: d.slice(0, 10), time: d.slice(11, 16) };
  }

  // Links
  const inviteLink = token => `${(C.SITE_URL || location.origin).replace(/\/$/, '')}/invite.html?t=${token}`;
  const waLink = (phone, text) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  function fillTemplate(tpl, ev, g) {
    return String(tpl || '')
      .replace(/{(الاسم|name)}/g, g.name)
      .replace(/{(العدد|invites)}/g, g.seats)
      .replace(/{(التاريخ|date)}/g, fmtDate(ev.starts_at, ev.lang))
      .replace(/{(الوقت|time)}/g, fmtTime(ev.starts_at, ev.lang))
      .replace(/{(المكان|venue)}/g, ev.venue || '')
      .replace(/{(المناسبة|event)}/g, ev.headline || ev.title || '')
      .replace(/{(الرابط|link)}/g, inviteLink(g.token));
  }
  const DEFAULT_TEMPLATE = 'حياكم الله {الاسم}\n\nنتشرف بدعوتكم لحضور {المناسبة} يوم {التاريخ}.\n\nعدد الدعوات: {العدد}\nلتأكيد الحضور أو الاعتذار:\n{الرابط}';
  const DEFAULT_TEMPLATE_EN = 'Hello {name} \uD83E\uDD0D\n\nYou\u2019re invited to {event} on {date} at {time}.\n\nPlease tap your personal link to RSVP:\n{link}';
  const templateFor = ev => ev.message_template || (ev.lang === 'en' ? DEFAULT_TEMPLATE_EN : DEFAULT_TEMPLATE);

  // Theme from the host's invite colours
  const hex2rgb = h => { h = String(h || '#000000').replace('#', ''); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16) || 0); };
  const rgb2hex = a => '#' + a.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('');
  const mix = (a, b, t) => { const x = hex2rgb(a), y = hex2rgb(b); return rgb2hex(x.map((v, i) => v + (y[i] - v) * t)); };
  const lum = h => { const c = hex2rgb(h).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * c[0] + .7152 * c[1] + .0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
  function themeVars(accent, paper) {
    const light = lum(paper) > .4;
    if (contrast(accent, paper) < 2.6) accent = light ? mix(accent, '#000000', .35) : mix(accent, '#FFFFFF', .45);
    const ink = light ? mix(accent, '#000000', .5) : mix(paper, '#FFFFFF', .88);
    return { '--t-paper': paper, '--t-accent': accent, '--t-ink': ink, '--t-muted': mix(ink, paper, .38), '--t-line': mix(accent, paper, .78), '--t-frame2': mix(accent, paper, .5), '--t-accent-ink': lum(accent) > .45 ? '#1A1A1A' : '#FFFFFF' };
  }
  function applyTheme(el, accent, paper) { const v = themeVars(accent || '#65060B', paper || '#FFFBFA'); Object.keys(v).forEach(k => el.style.setProperty(k, v[k])); }

  // Calendar
  function calLink(ev) {
    if (!ev.starts_at) return '#';
    const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const end = ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 4 * 3600e3).toISOString();
    const q = new URLSearchParams({ action: 'TEMPLATE', text: ev.headline || ev.title || '', dates: `${f(ev.starts_at)}/${f(end)}`, location: ev.venue || '', ctz: TZ });
    return 'https://calendar.google.com/calendar/render?' + q.toString();
  }
  function icsBlobUrl(ev) {
    if (!ev.starts_at) return '#';
    const f = d => new Date(d).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const end = ev.ends_at || new Date(new Date(ev.starts_at).getTime() + 4 * 3600e3).toISOString();
    const clean = s => String(s || '').replace(/[\n,;]/g, ' ');
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//RSVP//AR', 'BEGIN:VEVENT', `UID:${Date.now()}@rsvp`, `DTSTAMP:${f(new Date())}`,
      `DTSTART:${f(ev.starts_at)}`, `DTEND:${f(end)}`, `SUMMARY:${clean(ev.headline || ev.title)}`, `LOCATION:${clean(ev.venue)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    return URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  }

  // Login with a 6-digit code (or the magic link) sent to the user's email. Arabic and English.
  const LT = {
    en: { kick: 'Welcome back', h: 'Log in', sub: 'Type your email and we’ll send you a login link.', email: 'Email', send: 'Send my login link',
      kick2: 'Check your inbox', h2: 'Check your email', sent: e => `We sent a login link to <bdi dir="ltr"><b>${e}</b></bdi>. Tap it on this phone and you’re in. If the email has a code, you can type it here instead.`,
      code: 'Code (optional)', verify: 'Log in with code', back: 'Use a different email', bad: 'Please enter a valid email', fail: 'Couldn’t send the email: ',
      wrong: 'That code is wrong or has expired', cfgH: 'Almost there', cfgP: 'Add your Supabase details to config.js first.' },
    ar: { kick: 'هلا والله', h: 'تسجيل الدخول', sub: 'اكتبوا إيميلكم ونرسل لكم رابط الدخول.', email: 'الإيميل', send: 'أرسلوا لي رابط الدخول',
      kick2: 'شيّكوا الإيميل', h2: 'وصلكم إيميل', sent: e => `أرسلنا رابط الدخول إلى <bdi dir="ltr"><b>${e}</b></bdi>. اضغطوا عليه من هذا التلفون وتدخلون على طول. وإذا فيه رمز، تقدرون تكتبونه هني.`,
      code: 'الرمز (اختياري)', verify: 'دخول بالرمز', back: 'استخدام إيميل ثاني', bad: 'اكتبوا إيميل صحيح', fail: 'ما قدرنا نرسل الإيميل: ',
      wrong: 'الرمز غلط أو انتهت صلاحيته', cfgH: 'باقي شوي', cfgP: 'أضيفوا بيانات Supabase في config.js أول.' }
  };
  const uiLang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const ENVELOPE = '<svg class="login-env" viewBox="0 0 40 30" width="40" height="30" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="1.5" width="37" height="27" rx="3"/><path class="flap" d="M2.5 3l17.5 13L37.5 3"/></svg>';
  async function requireLogin(mount, onReady) {
    if (!sb) { const t = LT[uiLang()]; mount.innerHTML = `<div class="login-wrap"><div class="login box"><h2>${t.cfgH}</h2><p class="sub">${t.cfgP}</p></div></div>`; return; }
    const { data } = await sb.auth.getSession();
    if (data.session) { onReady(data.session); return; }
    let email = '', step = 'email', done = false;
    const draw = () => {
      if (done) return;
      const t = LT[uiLang()], typed = $('#lgEmail') ? $('#lgEmail').value : email;
      mount.innerHTML = `<div class="login-wrap">` + (step === 'email'
        ? `<div class="login box">${ENVELOPE}<p class="kicker">${t.kick}</p><h2>${t.h}</h2><p class="sub">${t.sub}</p>
           <label class="f" for="lgEmail">${t.email}</label><input type="email" id="lgEmail" dir="ltr" autocomplete="email" placeholder="you@example.com" value="${esc(typed)}">
           <div style="margin-top:14px"><button class="btn" id="lgSend" style="width:100%">${t.send}</button></div></div>`
        : `<div class="login box sent">${ENVELOPE}<p class="kicker">${t.kick2}</p><h2>${t.h2}</h2><p class="sub">${t.sent(esc(email))}</p>
           <label class="f" for="lgCode">${t.code}</label><input type="text" id="lgCode" dir="ltr" inputmode="numeric" autocomplete="one-time-code">
           <div style="margin-top:14px"><button class="btn" id="lgVerify" style="width:100%">${t.verify}</button></div>
           <p style="margin-top:12px"><button class="link" id="lgBack">${t.back}</button></p></div>`) + `</div>`;
      if (step === 'email') {
        const go = async () => {
          email = $('#lgEmail').value.trim().toLowerCase();
          if (!/^\S+@\S+\.\S+$/.test(email)) { toast(LT[uiLang()].bad); return; }
          $('#lgSend').disabled = true;
          const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: location.href.split('#')[0] } });
          if ($('#lgSend')) $('#lgSend').disabled = false;
          if (error) { toast(LT[uiLang()].fail + error.message); return; }
          step = 'code'; draw();
        };
        $('#lgSend').onclick = go;
        $('#lgEmail').onkeydown = e => { if (e.key === 'Enter') go(); };
      } else {
        $('#lgBack').onclick = () => { step = 'email'; draw(); };
        $('#lgVerify').onclick = async () => {
          const token = asciiDigits($('#lgCode').value).replace(/\D/g, '');
          const { data: d, error } = await sb.auth.verifyOtp({ email, token, type: 'email' });
          if (error) { toast(LT[uiLang()].wrong); return; }
          done = true; mount.innerHTML = ''; onReady(d.session);
        };
      }
    };
    draw();
    // redraw in the new language when the page switches
    new MutationObserver(() => { if (!done && mount.querySelector('.login')) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    sb.auth.onAuthStateChange((ev, session) => { if (ev === 'SIGNED_IN' && session && !done && mount.querySelector('.login')) { done = true; mount.innerHTML = ''; onReady(session); } });
  }
  async function signOut() { if (sb) await sb.auth.signOut(); location.reload(); }

  // Big libraries load only when someone actually uploads a file.
  const LIBS = {
    xlsx: 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js',
    mammoth: 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js',
    pdf: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js'
  };
  const loaded = {};
  function need(name) {
    if (!loaded[name]) loaded[name] = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = LIBS[name]; s.async = true;
      s.onload = () => {
        if (name === 'pdf' && window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        res();
      };
      s.onerror = () => { delete loaded[name]; rej(new Error('Couldn’t load a helper. Check your connection and try again.')); };
      document.head.appendChild(s);
    });
    return loaded[name];
  }

  // The upgraded database functions (migrations/002_mvp_core.sql). Until they are installed,
  // every page keeps working the old way.
  const missingFn = err => !!err && (err.code === 'PGRST202' || err.code === '42883' || /Could not find the function/i.test(err.message || ''));
  // A database answer always has an error code; a dropped connection doesn't.
  const netFail = err => !!err && !err.code;
  let v2Probe = null;
  function v2Ready() {
    if (!sb) return Promise.resolve(false);
    if (!v2Probe) v2Probe = (async () => {
      for (let i = 0; i < 3; i++) {
        let r;
        try { r = await sb.rpc('get_event_public_v2', { p_code: '-' }); } catch (e) { r = { error: { message: String(e) } }; }
        if (!netFail(r.error)) return !missingFn(r.error);
        await new Promise(res => setTimeout(res, 1200));
      }
      // No connection: use the old functions. They stay installed after the upgrade, so this is always safe.
      v2Probe = null; return false;
    })();
    return v2Probe;
  }
  // Try the upgraded function first, fall back to the old one if it isn't installed yet.
  async function rpc2(name, args, oldName, oldArgs) {
    const r = await sb.rpc(name, args);
    if (netFail(r.error)) return { ...r, v2: null };   // connection problem: say so, decide nothing
    if (!missingFn(r.error)) { v2Probe = Promise.resolve(true); return { ...r, v2: true }; }
    v2Probe = Promise.resolve(false);
    if (!oldName) return { data: null, error: r.error, v2: false };
    return { ...(await sb.rpc(oldName, oldArgs)), v2: false };
  }

  // Name search that ignores capitals, Arabic diacritics and the usual spelling variants.
  const normName = s => String(s || '').toLowerCase()
    .replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
    .replace(/\s+/g, ' ').trim();

  // Seats: each guest is 1 person plus 0..5 extras.
  const MAX_EXTRAS = 5;
  const clampSeats = n => Math.max(1, Math.min(1 + MAX_EXTRAS, parseInt(n, 10) || 1));
  const peopleComing = g => g.status === 'yes' ? (g.confirmed_count || g.seats || 1) : 0;

  // Arabic-Indic and Persian digits → 0-9 (Arabic phone keyboards type these).
  const asciiDigits = s => String(s || '').replace(/[٠-٩]/g, c => '٠١٢٣٤٥٦٧٨٩'.indexOf(c)).replace(/[۰-۹]/g, c => '۰۱۲۳۴۵۶۷۸۹'.indexOf(c));

  // Colour mode (cream / light / dark) as a labelled segmented control, and the menu sheet.
  const THEMES = { cream: ['Cream', 'كريمي'], light: ['Light', 'فاتح'], dark: ['Dark', 'داكن'] };
  function currentTheme() {
    const t = document.documentElement.dataset.theme;
    if (t === 'cream' || t === 'light' || t === 'dark') return t;
    return window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'cream';
  }
  function drawThemeSwitch() {
    const el = document.getElementById('themeSw'); if (!el) return;
    const cur = currentTheme(), ar = uiLang() === 'ar';
    el.setAttribute('role', 'group'); el.setAttribute('aria-label', ar ? 'الألوان' : 'Colours');
    el.innerHTML = Object.entries(THEMES).map(([k, l]) => `<button type="button" data-t="${k}" aria-pressed="${k === cur}"><span class="sw sw-${k}" aria-hidden="true"></span>${ar ? l[1] : l[0]}</button>`).join('');
    el.querySelectorAll('button').forEach(b => b.onclick = () => { document.documentElement.dataset.theme = b.dataset.t; try { localStorage.setItem('ui-theme', b.dataset.t); } catch (e) {} drawThemeSwitch(); });
  }
  function mountMenu() {
    drawThemeSwitch();
    const btn = document.getElementById('menuBtn'), sheet = document.getElementById('menu');
    if (!btn || !sheet) return;
    const label = () => { const ar = uiLang() === 'ar'; btn.querySelector('.menu-l').textContent = ar ? 'القائمة' : 'Menu'; const h = sheet.querySelector('.sheet-h'); if (h) h.textContent = ar ? 'القائمة' : 'Menu'; const c = sheet.querySelector('.sheet-x'); if (c) c.setAttribute('aria-label', ar ? 'إغلاق' : 'Close'); };
    const close = () => { if (sheet.open) sheet.close(); };
    btn.onclick = () => { label(); drawThemeSwitch(); if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', ''); btn.setAttribute('aria-expanded', 'true'); };
    sheet.addEventListener('close', () => btn.setAttribute('aria-expanded', 'false'));
    sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('.sheet-x') || e.target.closest('[data-close]')) close(); });
    new MutationObserver(() => { label(); drawThemeSwitch(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    label();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountMenu); else mountMenu();

  // Small helpers for the back-office pages.
  const bdi = s => `<bdi>${esc(s)}</bdi>`;
  // "Noor & Fahad" → italic ampersand; Arabic "نور و فهد" keeps its و
  const ampTitle = s => esc(s).replace(/\s(&amp;|\+)\s/g, ' <span class="amp">&amp;</span> ');
  function countdown(iso, lang) {
    if (!iso) return '';
    const day = d => new Date(new Date(d).getTime() + 3 * 3600e3).toISOString().slice(0, 10);   // Kuwait date
    const n = Math.round((new Date(day(iso)) - new Date(day(new Date()))) / 864e5);
    const ar = lang === 'ar';
    if (n < 0) return ar ? 'انتهت المناسبة' : 'Event has passed';
    if (n === 0) return ar ? 'الليلة' : 'Tonight';
    if (n === 1) return ar ? 'باجر' : 'Tomorrow';
    return ar ? `باقي ${n} يوم` : `${n} days to go`;
  }
  const vibrate = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  const reducedMotion = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  // Count a number up (skipped when the phone asks for less motion).
  function countUp(el, to, ms = 600) {
    if (!el) return; to = +to || 0;
    const from = +el.dataset.n || 0; el.dataset.n = to;
    if (reducedMotion() || from === to) { el.textContent = to; return; }
    const t0 = performance.now();
    const step = t => { const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3); el.textContent = Math.round(from + (to - from) * e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  window.App = { asciiDigits, bdi, ampTitle, countdown, vibrate, reducedMotion, countUp, uiLang, drawThemeSwitch, sb, $, esc, toast, normPhone, showPhone, fmtDate, fmtTime, kwToIso, isoToKw, inviteLink, waLink, fillTemplate, DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_EN, templateFor,
    mix, lum, rgb2hex, themeVars, applyTheme, calLink, icsBlobUrl, requireLogin, signOut, configured,
    need, v2Ready, rpc2, missingFn, normName, MAX_EXTRAS, clampSeats, peopleComing };
})();

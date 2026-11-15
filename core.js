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
  // The business name. No logo yet: the name is set in type only.
  const BRAND = { en: (window.CONFIG && CONFIG.BRAND_EN) || 'Sina', ar: (window.CONFIG && CONFIG.BRAND) || 'سنة' };
  const brandTitle = (s, lang) => (s ? s + ' · ' : '') + BRAND[lang || uiLang()];
  async function requireLogin(mount, onReady) {
    if (!sb) { const t = LT[uiLang()]; mount.innerHTML = `<div class="login-wrap"><div class="login box"><h2>${t.cfgH}</h2><p class="sub">${t.cfgP}</p></div></div>`; return; }
    const { data } = await sb.auth.getSession();
    if (data.session) { onReady(data.session); return; }
    let email = '', step = 'email', done = false;
    const draw = () => {
      if (done) return;
      const t = LT[uiLang()], typed = $('#lgEmail') ? $('#lgEmail').value : email;
      mount.innerHTML = `<div class="login-wrap">` + (step === 'email'
        ? `<div class="login box"><p class="brandmark">${BRAND[uiLang()]}</p>${ENVELOPE}<p class="kicker">${t.kick}</p><h2>${t.h}</h2><p class="sub">${t.sub}</p>
           <label class="f" for="lgEmail">${t.email}</label><input type="email" id="lgEmail" dir="ltr" autocomplete="email" placeholder="you@example.com" value="${esc(typed)}">
           <div style="margin-top:14px"><button class="btn" id="lgSend" style="width:100%">${t.send}</button></div></div>`
        : `<div class="login box sent"><p class="brandmark">${BRAND[uiLang()]}</p>${ENVELOPE}<p class="kicker">${t.kick2}</p><h2>${t.h2}</h2><p class="sub">${t.sent(esc(email))}</p>
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

  // ---------- Name matching across spellings and scripts ----------
  // nameKey(s): one comparable form of a name. Arabic: no tashkeel/tatweel, one alef, ة→ه, ى→ي, ؤ→و, ئ→ي,
  // no hamza, no leading ال. Latin: lower case, no accents, y→i, ou/oo→u, ee/ie→i, ph→f, no doubled letters,
  // no word-final h after a vowel, no separate Al-/El-.
  // nameScore(query, name): 0 = no match; higher = better.
  //   100 same name · 80-89 name starts with the query · 60-69 each query word starts a name word
  //   45-54 the query is inside the name · 30-42 same name in another spelling or script (Maryam/مريم)
  //   15-24 nearly the same (one letter off, or still typing in the other script)
  const AR_MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g;
  const AR_LETTER = /[\u0621-\u064A\u066E-\u06D3]/;
  const arWord = w => {
    w = w.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىی]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك');
    if (w.length >= 4 && w.startsWith('ال')) w = w.slice(2);
    return w.replace(/(.)\1+/g, '$1');
  };
  const latWord = w => w.replace(/ph/g, 'f').replace(/y/g, 'i').replace(/ou|oo/g, 'u').replace(/ee|ie/g, 'i')
    .replace(/([a-z])\1+/g, '$1').replace(/([aeiou])h$/, '$1');
  function keyWords(s) {
    let t = asciiDigits(String(s || '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(AR_MARKS, '').toLowerCase()
      .replace(/['’‘`ʿʾ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    if (!t) return [];
    let w = t.split(' ').map(x => AR_LETTER.test(x) ? arWord(x) : latWord(x)).filter(Boolean);
    const rest = w.filter(x => !/^(al|el|ال)$/.test(x));
    return rest.length ? rest : w;
  }
  const nameKey = s => keyWords(s).join(' ');
  // A rough Gulf transliteration skeleton: consonants only, the same for Arabic and Latin spellings.
  const AR_SK = { 'ب': 'b', 'ت': 't', 'ث': 't', 'ج': 'j', 'ح': 'h', 'خ': 'X', 'د': 'd', 'ذ': 'd', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'S', 'ص': 's',
    'ض': 'd', 'ط': 't', 'ظ': 'd', 'غ': 'G', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'پ': 'b', 'چ': 'S', 'گ': 'G', 'ڤ': 'f' };
  function skel(w) {
    let s;
    if (AR_LETTER.test(w)) s = [...w].map(c => AR_SK[c] || (/\d/.test(c) ? c : '')).join('');
    else if (/^\d+$/.test(w)) s = w;
    else s = w.replace(/sh|ch/g, 'S').replace(/kh/g, 'X').replace(/gh/g, 'G').replace(/th/g, 't').replace(/dh/g, 'd')
      .replace(/ck|q|c|k/g, 'k').replace(/g/g, 'G').replace(/x/g, 'ks').replace(/p/g, 'b').replace(/v/g, 'f')
      .replace(/[32]/g, '').replace(/7/g, 'h').replace(/5/g, 'X').replace(/6/g, 't').replace(/9/g, 's')
      .replace(/[aeiouwy]/g, '');
    return s.length > 1 ? s.replace(/h$/, '') : s;
  }
  // Does the word start with a vowel sound? (i/ي can be either: Ibrahim/Yousef, إبراهيم/يوسف)
  const vowelStart = w => /^[iي]/.test(w) ? null : /^[aeouاع]/.test(w);
  function analyse(word) {
    const ar = AR_LETTER.test(word), forms = [{ sk: skel(word), v: vowelStart(word) }];
    // "Alotaibi" written as one word: also try it without the Al
    if (!ar && /^(al|el)[a-z]{3,}/.test(word)) forms.push({ sk: skel(word.slice(2)), v: vowelStart(word.slice(2)) });
    return { w: word, ar, forms, sk: forms[0].sk, v: forms[0].v };
  }
  const nameMemo = new Map();
  function nameInfo(s) {
    s = String(s || '');
    let r = nameMemo.get(s);
    if (r) return r;
    const words = keyWords(s);
    r = { key: words.join(' '), words: words.map(analyse) };
    r.flat = r.words.map(x => x.sk).join('');
    if (nameMemo.size > 5000) nameMemo.clear();
    nameMemo.set(s, r);
    return r;
  }
  function lev1(a, b) {
    if (a === b) return true;
    if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  // How well one typed word matches one name word: 3 same, 2 same in another spelling/script, 1 close, 0 no.
  function wordLevel(q, n, last) {
    if (q.w === n.w) return 3;
    const vow = (a, b) => a.v === null || b.v === null || a.v === b.v;   // Ahmad is not Hamad
    // short skeletons in the same script are too loose (Laila/Lulwa): there the spelling must be one letter off at most
    const close = q.ar !== n.ar ? (q.sk || q.w.length + n.w.length <= 8) : (q.sk.length > 2 || lev1(q.w, n.w));
    if (close && q.forms.some(a => n.forms.some(b => vow(a, b) && a.sk === b.sk && (a.sk || !b.sk)))) return 2;
    if (last && q.w.length >= 3 && q.sk.length >= 2 && n.forms.some(b => vow(q, b) && b.sk.length > q.sk.length && b.sk.startsWith(q.sk))) return 1;
    if (q.ar === n.ar && q.w.length >= 5 && n.w.length >= 5 && lev1(q.w, n.w)) return 1;
    return 0;
  }
  function nameScore(query, name) {
    const q = nameInfo(query), n = nameInfo(name);
    if (!q.key || !n.key) return 0;
    const bonus = Math.max(0, 9 - Math.floor(Math.max(0, n.key.length - q.key.length) / 2));
    if (q.key === n.key) return 100;
    if (n.key.startsWith(q.key)) return 80 + bonus;
    const nw = n.key.split(' '), qw = q.key.split(' ');
    let from = 0;
    const inOrder = qw.every(w => { const i = nw.findIndex((x, k) => k >= from && x.startsWith(w)); if (i < 0) return false; from = i + 1; return true; });
    if (inOrder) return 60 + bonus;
    if (q.key.length >= 4 && n.key.includes(q.key)) return 45 + bonus;
    // another spelling or script: every typed word matches a different name word
    const used = new Set();
    let min = 3;
    const all = q.words.every((w, i) => {
      let best = 0, at = -1;
      n.words.forEach((x, k) => { if (used.has(k)) return; const l = wordLevel(w, x, i === q.words.length - 1); if (l > best) { best = l; at = k; } });
      if (!best) return false;
      used.add(at); min = Math.min(min, best); return true;
    });
    if (all) return (min >= 2 ? 30 : 15) + (min >= 2 && q.words.length === n.words.length ? 3 : 0) + bonus;
    // names written as one word or two: "Abdul Aziz" / "عبدالعزيز"
    if (q.flat.length >= 3) {
      const parts = n.words.map(x => x.sk);
      for (let k = 0; k < parts.length; k++) {
        if (q.words[0].v !== null && n.words[k].v !== null && q.words[0].v !== n.words[k].v) continue;
        let acc = '';
        for (let j = k; j < parts.length && acc.length < q.flat.length; j++) { acc += parts[j]; if (acc === q.flat && (j > k || q.words.length > 1)) return 30 + bonus; }
      }
    }
    return 0;
  }
  // Sort a list by how well each item's name matches. Returns [{ item, score }], best first; ties keep list order.
  function searchNames(items, query, nameOf = x => x.name) {
    return (items || []).map((item, i) => ({ item, i, score: nameScore(query, nameOf(item)) }))
      .filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).map(({ item, score }) => ({ item, score }));
  }

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
  // ---------- Bottom sheets ----------
  // Open a <dialog class="sheet"> with focus on its heading, so the close button doesn't open looking pressed.
  // Tapping the backdrop or anything with [data-close] closes it.
  function openSheet(sheet) {
    if (!sheet) return;
    if (!sheet.dataset.wired) {
      sheet.dataset.wired = '1';
      sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('.sheet-x,[data-close]')) closeSheet(sheet); });
    }
    if (!sheet.open) { if (sheet.showModal) sheet.showModal(); else sheet.setAttribute('open', ''); }
    const h = sheet.querySelector('.sheet-h');
    if (h) { h.setAttribute('tabindex', '-1'); try { h.focus({ preventScroll: true }); } catch (e) { h.focus(); } }
  }
  function closeSheet(sheet) { if (!sheet) return; if (sheet.close && sheet.open) sheet.close(); else sheet.removeAttribute('open'); }

  // ---------- The Menu: Language, Colours, Help, and Log out set apart at the bottom ----------
  // Page markup (the convention):
  //   <button class="menu-btn" id="menuBtn" aria-expanded="false" aria-controls="menu"><i class="i i-menu"></i><span class="menu-l">Menu</span></button>
  //   <dialog class="sheet" id="menu" aria-labelledby="menuH"><div class="sheet-grab"></div>
  //     <div class="sheet-top"><h2 class="sheet-h" id="menuH">Menu</h2><button class="sheet-x" data-close aria-label="Close"><i class="i i-x"></i></button></div>
  //     <button class="btn ghost" id="lang">العربية</button>      the page's own language switch (keeps its onclick and its text)
  //     <button class="btn ghost" id="out" hidden>Log out</button>  shown by the page after login, onclick = App.signOut
  //   </dialog>
  // mountMenu lays this out as: Language row · Colours row · Help row · (gap) · Log out.
  // Nothing else goes in the Menu: no tabs, no other pages, no event lists (tabs and links on the page do that).
  // The word القائمة means the Menu only. Help: App.setHelp(lang => [[question, answer], ...]) per page.
  const ML = {
    en: { menu: 'Menu', close: 'Close', language: 'Language', colours: 'Colours', help: 'Help', helpH: 'Help', cur: 'English', theme: 'Colours' },
    ar: { menu: 'القائمة', close: 'إغلاق', language: 'اللغة', colours: 'الألوان', help: 'مساعدة', helpH: 'مساعدة', cur: 'العربية', theme: 'الألوان' }
  };
  const DEFAULT_HELP = {
    en: [['Something looks out of date?', 'Pull the page down to refresh it. When you’re online, changes from the rest of the team show up on their own.'],
      ['Language and colours', 'Change them here in the Menu. Your choice stays on this phone.'],
      ['Need a hand?', 'Message the person who set up your event.']],
    ar: [['فيه شي مو محدّث؟', 'اسحبوا الصفحة لتحت عشان تتحدث. وإذا النت شغال، تعديلات الباقين توصلكم بروحها.'],
      ['اللغة والألوان', 'تقدرون تغيرونها من هالقائمة، واختياركم ينحفظ على هالتلفون.'],
      ['تحتاجون مساعدة؟', 'كلموا الشخص اللي رتّب لكم المناسبة.']]
  };
  let helpFor = null;
  const setHelp = fn => { helpFor = typeof fn === 'function' ? fn : null; };
  function openHelp() {
    let sh = document.getElementById('helpSheet');
    if (!sh) {
      sh = document.createElement('dialog'); sh.className = 'sheet help-sheet'; sh.id = 'helpSheet'; sh.setAttribute('aria-labelledby', 'helpH');
      document.body.appendChild(sh);
    }
    const lang = uiLang(), t = ML[lang], items = (helpFor && helpFor(lang)) || DEFAULT_HELP[lang];
    sh.innerHTML = `<div class="sheet-grab"></div><div class="sheet-top"><h2 class="sheet-h" id="helpH">${t.helpH}</h2><button type="button" class="sheet-x" data-close aria-label="${t.close}"><i class="i i-x"></i></button></div>`
      + `<div class="help-list">${items.map(([q, a]) => `<div class="help-item"><h3 class="t-name">${esc(q)}</h3><p class="t-body">${esc(a)}</p></div>`).join('')}</div>`;
    openSheet(sh);
  }
  function layoutMenu(sheet) {
    if (sheet.querySelector('.menu-std')) return;
    const std = document.createElement('div'); std.className = 'menu-std';
    // Language: the current language, then the page's own #lang switch beside it
    const langRow = document.createElement('div'); langRow.className = 'menu-row'; langRow.dataset.row = 'lang';
    langRow.innerHTML = '<span class="menu-k" data-ml="language"></span><span class="seg langsw" role="group" data-ml-aria="language"><span class="langsw-cur" aria-current="true"></span></span>';
    const langBtn = document.getElementById('lang');
    if (langBtn) { langBtn.className = 'langsw-alt'; langBtn.type = 'button'; langRow.querySelector('.langsw').appendChild(langBtn); }
    std.appendChild(langRow);
    // Colours: keep the page's row if it has one
    let sw = document.getElementById('themeSw');
    let themeRow = sw && sw.closest('.menu-row');
    if (!themeRow) {
      themeRow = document.createElement('div'); themeRow.className = 'menu-row';
      themeRow.innerHTML = '<span class="menu-k" data-ml="colours"></span>';
      if (!sw) { sw = document.createElement('span'); sw.className = 'themesw'; sw.id = 'themeSw'; }
      themeRow.appendChild(sw);
    } else { const k = themeRow.firstElementChild; if (k && k !== sw) k.classList.add('menu-k'); }
    themeRow.dataset.row = 'theme';
    std.appendChild(themeRow);
    // Help
    const help = document.createElement('button'); help.type = 'button'; help.className = 'menu-row menu-help'; help.id = 'helpBtn'; help.dataset.row = 'help';
    help.innerHTML = '<span class="menu-k" data-ml="help"></span><i class="i i-chev" aria-hidden="true"></i>';
    help.onclick = () => { closeSheet(sheet); openHelp(); };
    std.appendChild(help);
    // Log out, set apart at the bottom
    const outWrap = document.createElement('div'); outWrap.className = 'menu-out';
    const out = document.getElementById('out');
    if (out) { out.className = 'menu-logout'; out.type = 'button'; outWrap.appendChild(out); }
    const top = sheet.querySelector('.sheet-top'), nav = sheet.querySelector('.menu-nav');
    (nav || top || sheet.firstChild) ? (nav || top).after(std) : sheet.appendChild(std);
    std.after(outWrap);
    sheet.querySelectorAll('.menu-foot').forEach(f => { if (!f.children.length) f.remove(); });
  }
  function labelMenu(sheet) {
    const lang = uiLang(), t = ML[lang];
    sheet.querySelectorAll('[data-ml]').forEach(e => { e.textContent = t[e.dataset.ml]; });
    sheet.querySelectorAll('[data-ml-aria]').forEach(e => e.setAttribute('aria-label', t[e.dataset.mlAria]));
    const sw = sheet.querySelector('.langsw'), cur = sheet.querySelector('.langsw-cur'), alt = document.getElementById('lang');
    if (cur) { cur.textContent = t.cur; cur.setAttribute('lang', lang); }
    // Arabic first, English second, in reading order
    if (sw && cur && alt && alt.parentNode === sw) { if (lang === 'ar') sw.append(cur, alt); else sw.append(alt, cur); }
  }
  function mountMenu() {
    drawThemeSwitch();
    const btn = document.getElementById('menuBtn'), sheet = document.getElementById('menu');
    if (!btn || !sheet) return;
    layoutMenu(sheet);
    drawThemeSwitch();
    const label = () => {
      const t = ML[uiLang()], l = btn.querySelector('.menu-l');
      if (l) l.textContent = t.menu;
      const h = sheet.querySelector('.sheet-h'); if (h) h.textContent = t.menu;
      const c = sheet.querySelector('.sheet-x'); if (c) c.setAttribute('aria-label', t.close);
      labelMenu(sheet);
    };
    btn.onclick = () => { label(); drawThemeSwitch(); openSheet(sheet); btn.setAttribute('aria-expanded', 'true'); };
    sheet.addEventListener('close', () => btn.setAttribute('aria-expanded', 'false'));
    sheet.addEventListener('click', e => { if (e.target === sheet || e.target.closest('.sheet-x') || e.target.closest('[data-close]')) closeSheet(sheet); });
    new MutationObserver(() => { label(); drawThemeSwitch(); const hs = document.getElementById('helpSheet'); if (hs && hs.open) openHelp(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
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

  // Every number carries its word. kind: 'person' (one head) or 'guest' (one invitation).
  // Arabic: 1 شخص واحد · 2 شخصين · 3-10 أشخاص · 11+ شخص (same for ضيف/ضيوف).
  const arN = (n, one, two, few, many) => n === 1 ? one : n === 2 ? two : (n % 100 >= 3 && n % 100 <= 10) ? `${n} ${few}` : `${n} ${many}`;
  const COUNT = {
    person: { en: ['person', 'people'], ar: ['شخص واحد', 'شخصين', 'أشخاص', 'شخص'] },
    guest: { en: ['guest', 'guests'], ar: ['ضيف واحد', 'ضيفين', 'ضيوف', 'ضيف'] }
  };
  function countWord(n, kind, lang) {
    n = Math.max(0, parseInt(n, 10) || 0);
    const k = COUNT[kind] || COUNT.person;
    if ((lang || uiLang()) === 'ar') return arN(n, ...k.ar);
    return `${n} ${n === 1 ? k.en[0] : k.en[1]}`;
  }

  // A band with an Undo button that stays for a few seconds (door check-in, "Turn down").
  // undoBand({ text, undoLabel, onUndo, ms = 8000, tone = 'ok' | 'wait' | 'no', mount }) → { close }
  // onUndo runs only if Undo is tapped before it closes. mount: an element to show it in (default: fixed above the tab bar).
  function undoBand({ text, undoLabel, onUndo, ms = 8000, tone = 'ok', mount = null } = {}) {
    const el = document.createElement('div');
    el.className = `undoband tone-${tone}` + (mount ? '' : ' floating'); el.setAttribute('role', 'status');
    el.innerHTML = `<span class="ub-t"></span><button type="button" class="ub-undo"></button>`;
    el.querySelector('.ub-t').textContent = text || '';
    el.querySelector('.ub-undo').textContent = undoLabel || (uiLang() === 'ar' ? 'تراجع' : 'Undo');
    let timer = null, done = false;
    const close = () => { if (done) return; done = true; clearTimeout(timer); el.remove(); };
    el.querySelector('.ub-undo').onclick = () => { if (done) return; close(); if (onUndo) onUndo(); };
    if (!mount) document.querySelectorAll('.undoband.floating').forEach(x => x.remove());
    (mount || document.body).appendChild(el);
    if (ms) timer = setTimeout(close, ms);
    return { close, el };
  }

  // One name for the people who run the event, the same on every page and in Help:
  // English "the hosts", Arabic "أهل المناسبة" (never المضيف / المضيفين / أصحاب المناسبة / صاحبة المناسبة).
  // hostWord(lang?, form?) → form 'plain' (the hosts / أهل المناسبة), 'cap' (The hosts), 'to' (to the hosts / لأهل المناسبة),
  // 'page' (their page: Host dashboard / صفحة أهل المناسبة). lang defaults to the page language.
  const HOSTS = {
    en: { plain: 'the hosts', cap: 'The hosts', to: 'to the hosts', page: 'Host dashboard' },
    ar: { plain: 'أهل المناسبة', cap: 'أهل المناسبة', to: 'لأهل المناسبة', page: 'صفحة أهل المناسبة' }
  };
  const hostWord = (lang, form = 'plain') => { const t = HOSTS[(lang || uiLang()) === 'ar' ? 'ar' : 'en']; return t[form] || t.plain; };

  window.App = { asciiDigits, bdi, ampTitle, countdown, vibrate, reducedMotion, countUp, uiLang, drawThemeSwitch, sb, $, esc, toast, normPhone, showPhone, fmtDate, fmtTime, kwToIso, isoToKw, inviteLink, waLink, fillTemplate, DEFAULT_TEMPLATE, DEFAULT_TEMPLATE_EN, templateFor,
    mix, lum, rgb2hex, themeVars, applyTheme, calLink, icsBlobUrl, requireLogin, signOut, configured, BRAND, brandTitle,
    need, v2Ready, rpc2, missingFn, normName, MAX_EXTRAS, clampSeats, peopleComing,
    nameKey, nameScore, searchNames, openSheet, closeSheet, setHelp, openHelp, countWord, arN, undoBand, hostWord, HOSTS };
})();

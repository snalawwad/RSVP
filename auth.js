// One login for every page that needs it (host.html, new.html, pay.html, me.html). Loaded after core.js.
// Figma Host 1 (01 Welcome, 02 Create account, 02b Log in, 03 Enter code + 03a/03b/03c) and Guest G08/G09.
//
//   SinaAuth.mount(el, { audience: 'host' | 'guest', start: 'welcome' | 'signup' | 'login', onReady(session, profile), onLang() })
//   SinaAuth.session()  → the current session or null
//   SinaAuth.profile()  → { name, phone, email } from my_profile_v2 (or what we know from the login)
//   SinaAuth.signOut(to)
//
// CONFIG.LOGIN_PHONE true: a phone number and a code sent on WhatsApp (Supabase phone OTP; the Auth "Send SMS hook"
// sends it as a WhatsApp message). false (today): the email code that works now. Both are built; the switch picks one.
(function () {
  const C = window.CONFIG || {}, sb = App.sb, esc = App.esc;
  const PHONE = !!C.LOGIN_PHONE;
  const LEN = Math.max(4, Math.min(10, +C.LOGIN_CODE_LENGTH || 6));
  const CODE_LIFE = 10 * 60e3;   // codes last 10 minutes (Figma 03c); after that a failed code reads as expired
  const RESEND_AFTER = 60;       // seconds before "Send a new code" (Supabase allows one code a minute)
  const lang = () => document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const BR = () => App.BRAND[lang()];

  const T = {
    en: {
      wH1: 'Send invites anywhere.', wH2: 'See who’s coming.', wP: 'Share a single link for weddings, engagements, and all gatherings in Kuwait.',
      wSign: 'Create an account', wLog: 'Log in', otherLang: 'العربية', langL: 'Language',
      sH: 'Create your account', sP: PHONE ? 'We’ll send a code to your phone on WhatsApp. No password.' : 'We’ll send a code to your email. No password.',
      name: 'Your name', phone: 'Phone number', email: PHONE ? 'Email (optional)' : 'Email', send: 'Send code', haveAcc: 'I already have an account',
      terms: 'By continuing you agree to the terms', termsLink: 'terms',
      lH: 'Welcome back', backL: 'Back', lP: PHONE ? 'Enter the number you signed up with. We’ll send a code on WhatsApp.' : 'Enter the email you signed up with. We’ll send you a code.',
      newHere: 'New here? Create an account',
      gH: 'See your invites', gP: PHONE ? 'Log in with the phone number your invite was sent to.' : 'Log in with your email and we’ll send you a code.',
      gNote: 'Got an invite link? Just open it. You don’t need to log in first.',
      cH: 'Enter the code', cSent: w => PHONE ? `Sent to <bdi dir="ltr">${w}</bdi> on WhatsApp.` : `Sent to <bdi dir="ltr">${w}</bdi>. You can also tap the link in the email.`,
      cSentG: w => PHONE ? `We texted a code to <bdi dir="ltr">${w}</bdi>.` : `We sent a code to <bdi dir="ltr">${w}</bdi>.`,
      codeL: 'Login code', digit: (i, n) => `Digit ${i} of ${n}`,
      resendIn: s => `Resend code in ${s}`, resend: 'Resend code', newCode: 'Send a new code', cont: 'Log in', contUp: 'Create my account', other: PHONE ? 'Use a different number' : 'Use a different email',
      wrong: 'That code isn’t right. Check the message and try again.', expired: 'This code has expired.', resent: 'We sent a new code',
      needName: 'Type your name', badPhone: 'Type a full phone number', badEmail: 'Type a full email address',
      sendFail: 'We couldn’t send the code. Check your connection and try again.', tooMany: 'Too many codes asked for. Wait a minute, then try again.',
      notReady: 'Almost there', notReadyP: 'Add your Supabase details to config.js first.'
    },
    ar: {
      wH1: 'دعواتكم توصل للكل.', wH2: 'وتعرفون منو بيحضر.', wP: 'رابط واحد لكل ضيف، للأعراس والملكات وكل مناسباتكم في الكويت.',
      wSign: 'سوّوا حساب', wLog: 'سجّلوا الدخول', otherLang: 'English', langL: 'اللغة',
      sH: 'سوّوا حسابكم', sP: PHONE ? 'نرسل لكم رمز على الواتساب، بدون كلمة سر.' : 'نرسل لكم رمز على الإيميل، بدون كلمة سر.',
      name: 'اسمكم', phone: 'رقم التلفون', email: PHONE ? 'الإيميل (اختياري)' : 'الإيميل', send: 'أرسلوا الرمز', haveAcc: 'عندكم حساب؟ سجّلوا الدخول',
      terms: 'لما تكملون، توافقون على الشروط', termsLink: 'الشروط',
      lH: 'هلا فيكم من جديد', backL: 'رجوع', lP: PHONE ? 'اكتبوا الرقم اللي سجلتوا فيه، ونرسل لكم رمز على الواتساب.' : 'اكتبوا الإيميل اللي سجلتوا فيه، ونرسل لكم رمز.',
      newHere: 'أول مرة؟ سوّوا حساب',
      gH: 'شوفوا دعواتكم', gP: PHONE ? 'سجّلوا الدخول بالرقم اللي وصلتكم عليه الدعوة.' : 'سجّلوا الدخول بإيميلكم، ونرسل لكم رمز.',
      gNote: 'عندكم رابط دعوة؟ افتحوه على طول، ما تحتاجون تسجلون دخول.',
      cH: 'اكتبوا الرمز', cSent: w => PHONE ? `أرسلناه إلى <bdi dir="ltr">${w}</bdi> على الواتساب.` : `أرسلناه إلى <bdi dir="ltr">${w}</bdi>. وتقدرون تضغطون الرابط اللي بالإيميل بعد.`,
      cSentG: w => PHONE ? `أرسلنا رمز إلى <bdi dir="ltr">${w}</bdi>.` : `أرسلنا رمز إلى <bdi dir="ltr">${w}</bdi>.`,
      codeL: 'رمز الدخول', digit: (i, n) => `الرقم ${i} من ${n}`,
      resendIn: s => `تقدرون تطلبون رمز جديد بعد ${s}`, resend: 'أرسلوا الرمز مرة ثانية', newCode: 'أرسلوا رمز جديد', cont: 'سجّلوا الدخول', contUp: 'سوّوا الحساب', other: PHONE ? 'استخدموا رقم ثاني' : 'استخدموا إيميل ثاني',
      wrong: 'الرمز مو صحيح. شيّكوا الرسالة وجربوا مرة ثانية.', expired: 'انتهت صلاحية الرمز.', resent: 'أرسلنا لكم رمز جديد',
      needName: 'اكتبوا اسمكم', badPhone: 'اكتبوا رقم التلفون كامل', badEmail: 'اكتبوا الإيميل كامل',
      sendFail: 'ما قدرنا نرسل الرمز. شيّكوا النت وجربوا مرة ثانية.', tooMany: 'طلبتوا رموز واجد. انطروا دقيقة وجربوا مرة ثانية.',
      notReady: 'باقي شوي', notReadyP: 'أضيفوا بيانات Supabase في config.js أول.'
    }
  };
  const t = () => T[lang()];

  const ARCH = '<span class="au-mark" aria-hidden="true"></span>';
  let state = null;   // { el, opts, step, name, email, phone, sentAt, code, err, timer, done }

  async function session() { if (!sb) return null; try { const { data } = await sb.auth.getSession(); return data.session || null; } catch (e) { return null; } }

  let profCache = null;
  async function profile(force) {
    if (profCache && !force) return profCache;
    const s = await session(); if (!s) return null;
    const u = s.user || {};
    let p = { name: (u.user_metadata && u.user_metadata.name) || '', phone: u.phone || '', email: u.email || '' };
    try {
      const r = await sb.rpc('my_profile_v2');
      if (!r.error && r.data) p = { ...p, ...Object.fromEntries(Object.entries(r.data).filter(([, v]) => v != null && v !== '')) };
    } catch (e) {}
    profCache = p; return p;
  }

  async function signOut(to) {
    profCache = null;
    if (sb) { try { await sb.auth.signOut(); } catch (e) {} }
    if (to) location.href = to; else location.reload();
  }

  // ---------- drawing ----------
  // a way back on every step: welcome → the site's home page, log in / sign up → welcome (a guest: home), code → the step before
  const BACK = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
  function head(withMark = true) {
    return `<div class="au-top"><button type="button" class="au-back" id="auBack" aria-label="${esc(t().backL)}">${BACK}</button>${withMark ? `${ARCH}<span class="au-brand">${esc(BR())}</span>` : ''}<button type="button" class="au-lang" id="auLang" lang="${lang() === 'ar' ? 'en' : 'ar'}" aria-label="${esc(t().langL)}">${t().otherLang}</button></div>`;
  }
  const field = (id, label, type, val, extra = '') => `<div class="fld"><label class="f" for="${id}">${esc(label)}</label><input type="${type}" id="${id}" value="${esc(val || '')}" ${extra}></div>`;
  const contact = () => PHONE ? App.prettyPhone(state.phone) : state.email;

  function draw() {
    const s = state; if (!s || s.done) return;
    const T0 = t(), guest = s.opts.audience === 'guest';
    let html = '';
    if (s.step === 'welcome') {
      html = `<div class="scr au au-welcome">${head(false)}
        <div class="scr-main"><h1 class="au-hero"><span>${T0.wH1}</span><span>${T0.wH2}</span></h1>
          <div class="au-art" aria-hidden="true"><img class="a-door" src="assets/host/welcome-doorway.svg" alt=""><img class="a-trail" src="assets/host/welcome-trail.svg" alt=""><img class="a-bird" src="assets/host/welcome-bird.svg" alt=""><img class="a-inv" src="assets/host/welcome-invitation.svg" alt=""></div>
          <p class="au-lead">${T0.wP}</p></div>
        <div class="scr-foot"><button type="button" class="btn primary block" id="auSign">${T0.wSign}</button><button type="button" class="btn soft-plum block" id="auLog">${T0.wLog}</button></div></div>`;
    } else if (s.step === 'signup' || s.step === 'login') {
      const up = s.step === 'signup';
      const h = guest ? T0.gH : up ? T0.sH : T0.lH, p = guest ? T0.gP : up ? T0.sP : T0.lP;
      const fields = (up ? field('auName', T0.name, 'text', s.name, 'autocomplete="name" dir="auto"') : '')
        + (PHONE ? field('auPhone', T0.phone, 'tel', s.phoneRaw, 'autocomplete="tel" inputmode="tel" dir="ltr" placeholder="+965 9XXX XXXX"') : '')
        + (up || !PHONE ? field('auEmail', T0.email, 'email', s.email, 'autocomplete="email" dir="ltr" placeholder="you@example.com"') : '');
      html = `<div class="scr au">${head()}
        <form class="scr-main" id="auForm" novalidate><h1 class="scr-h">${h}</h1><p class="scr-p">${p}</p>${fields}
          ${guest ? `<p class="note-box">${T0.gNote}</p>` : ''}<p class="form-err" id="auErr" role="alert" hidden></p><button type="submit" hidden></button></form>
        <div class="scr-foot"><button type="button" class="btn primary block" id="auSend">${PHONE ? '<i class="i i-whatsapp"></i>' : ''}${T0.send}</button>
          ${guest ? '' : `<button type="button" class="btn quiet block" id="auSwap">${up ? T0.haveAcc : T0.newHere}</button>`}
          ${up ? `<p class="au-terms"><a href="terms.html">${T0.terms}</a></p>` : ''}</div></div>`;
    } else {
      const left = Math.max(0, RESEND_AFTER - Math.floor((Date.now() - s.sentAt) / 1000));
      const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
      const err = s.err === 'wrong' ? `<p class="au-err" role="alert">${T0.wrong}</p>` : s.err === 'expired' ? `<p class="au-err" role="alert">${T0.expired}</p>` : '';
      const resend = s.err === 'expired' ? `<button type="button" class="btn soft-plum" id="auNew">${T0.newCode}</button>`
        : left > 0 ? `<p class="au-wait" id="auWait">${T0.resendIn(`<span dir="ltr">${mm}</span>`)}</p>` : `<button type="button" class="btn quiet au-resend" id="auNew">${s.err ? T0.resend : T0.newCode}</button>`;
      const boxes = Array.from({ length: LEN }, (_, i) => `<span class="cb${s.code.length === i ? ' cur' : ''}${s.code[i] ? ' on' : ''}">${esc(s.code[i] || '')}</span>`).join('');
      html = `<div class="scr au">${head()}
        <div class="scr-main"><h1 class="scr-h">${T0.cH}</h1><p class="scr-p">${(guest ? T0.cSentG : T0.cSent)(esc(contact()))}</p>
          <label class="codebox${s.err ? ' bad' : ''}" for="auCode"><span class="sr">${T0.codeL}</span><input id="auCode" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="${LEN}" dir="ltr" value="${esc(s.code)}" aria-invalid="${!!s.err}"><span class="cbs" aria-hidden="true">${boxes}</span></label>
          ${err}<div class="au-again">${resend}</div>
          <button type="button" class="btn quiet au-other" id="auOther">${T0.other}</button></div>
        <div class="scr-foot"><button type="button" class="btn primary block" id="auGo" ${s.code.length === LEN && !s.err ? '' : 'disabled'}>${s.from === 'signup' ? T0.contUp : T0.cont}</button></div></div>`;
    }
    s.el.innerHTML = html;
    wire();
  }

  function wire() {
    const s = state, $ = id => s.el.querySelector('#' + id);
    $('auLang').onclick = () => {
      if (s.opts.onLang) s.opts.onLang();
      else { const l = lang() === 'ar' ? 'en' : 'ar'; document.documentElement.lang = l; document.documentElement.dir = l === 'ar' ? 'rtl' : 'ltr'; try { localStorage.setItem('host-lang', l); } catch (e) {} }
      draw();
    };
    $('auBack').onclick = () => {
      s.err = null;
      if (s.step === 'code') { s.code = ''; go(s.from || 'login'); }
      else if (s.step !== 'welcome' && s.opts.audience !== 'guest') go('welcome');
      else location.href = 'index.html';
    };
    if (s.step === 'welcome') { $('auSign').onclick = () => go('signup'); $('auLog').onclick = () => go('login'); return; }
    if (s.step === 'signup' || s.step === 'login') {
      const keep = () => { if ($('auName')) s.name = $('auName').value; if ($('auPhone')) s.phoneRaw = $('auPhone').value; if ($('auEmail')) s.email = $('auEmail').value.trim().toLowerCase(); };
      s.el.querySelectorAll('input').forEach(i => i.addEventListener('input', () => { keep(); const e = $('auErr'); if (e) e.hidden = true; }));
      $('auForm').onsubmit = e => { e.preventDefault(); send(); };
      $('auSend').onclick = send;
      if ($('auSwap')) $('auSwap').onclick = () => { keep(); go(s.step === 'signup' ? 'login' : 'signup'); };
      const first = s.el.querySelector('input'); if (first && !first.value) setTimeout(() => first.focus({ preventScroll: true }), 30);
      return;
    }
    const inp = $('auCode');
    inp.oninput = () => {
      const v = App.asciiDigits(inp.value).replace(/\D/g, '').slice(0, LEN);
      s.code = v; if (s.err === 'wrong') s.err = null;
      paintBoxes();
      // all digits in: log in straight away (once per code, so a wrong code isn't re-sent until it's changed)
      if (v.length === LEN && v !== s.lastTried) { s.lastTried = v; $('auGo').focus({ preventScroll: true }); verify(); }
    };
    inp.onkeydown = e => { if (e.key === 'Enter' && s.code.length === LEN) verify(); };
    $('auGo').onclick = verify;
    $('auOther').onclick = () => { s.code = ''; s.err = null; go(s.from || 'login'); };
    if ($('auNew')) $('auNew').onclick = resend;
    setTimeout(() => { if (document.activeElement !== $('auGo')) inp.focus({ preventScroll: true }); }, 30);
    clearInterval(s.timer);
    if (!s.err || s.err === 'wrong') s.timer = setInterval(() => { const left = RESEND_AFTER - Math.floor((Date.now() - s.sentAt) / 1000); if (left <= 0) { clearInterval(s.timer); draw(); } else { const w = $('auWait'); if (w) w.innerHTML = t().resendIn(`<span dir="ltr">${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}</span>`); } }, 1000);
  }
  function paintBoxes() {
    const s = state, box = s.el.querySelector('.codebox'); if (!box) return;
    box.classList.toggle('bad', !!s.err);
    box.querySelectorAll('.cb').forEach((b, i) => { b.textContent = s.code[i] || ''; b.classList.toggle('on', !!s.code[i]); b.classList.toggle('cur', s.code.length === i); });
    const err = s.el.querySelector('.au-err'); if (err && !s.err) err.remove();
    const go = s.el.querySelector('#auGo'); if (go) go.disabled = !(s.code.length === LEN && !s.err);
  }
  function go(step) { state.step = step; state.err = null; draw(); const h = state.el.querySelector('h1'); if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); } window.scrollTo(0, 0); }
  function formErr(msg, id) { const e = state.el.querySelector('#auErr'); if (e) { e.textContent = msg; e.hidden = false; } const i = id && state.el.querySelector('#' + id); if (i) { i.classList.add('bad'); i.focus(); } App.toast(msg); }

  async function send() {
    const s = state, T0 = t(), up = s.step === 'signup';
    s.from = s.step;
    if (up && !String(s.name || '').trim()) return formErr(T0.needName, 'auName');
    if (PHONE) { s.phone = App.normPhone(s.phoneRaw); if (s.phone.length < 10) return formErr(T0.badPhone, 'auPhone'); }
    const okEmail = /^\S+@\S+\.\S+$/.test(s.email || '');
    if ((!PHONE && !okEmail) || (PHONE && up && s.email && !okEmail)) return formErr(T0.badEmail, 'auEmail');
    const btn = s.el.querySelector('#auSend'); btn.setAttribute('aria-busy', 'true');
    const r = await otp();
    if (btn.isConnected) btn.removeAttribute('aria-busy');
    if (r.error) { formErr(/rate|too many|seconds/i.test(r.error.message || '') ? T0.tooMany : T0.sendFail); return; }
    s.sentAt = Date.now(); s.code = ''; s.err = null; go('code');
  }
  async function otp() {
    const s = state;
    try {
      if (PHONE) return await sb.auth.signInWithOtp({ phone: '+' + s.phone, options: { data: s.name ? { name: s.name.trim() } : undefined } });
      return await sb.auth.signInWithOtp({ email: s.email, options: { emailRedirectTo: location.href.split('#')[0], data: s.name ? { name: s.name.trim() } : undefined } });
    } catch (e) { return { error: e }; }
  }
  async function resend() {
    const s = state, b = s.el.querySelector('#auNew'); if (b) b.setAttribute('aria-busy', 'true');
    const r = await otp();
    if (r.error) { if (b && b.isConnected) b.removeAttribute('aria-busy'); App.toast(/rate|too many|seconds/i.test(r.error.message || '') ? t().tooMany : t().sendFail); return; }
    s.sentAt = Date.now(); s.code = ''; s.err = null; draw(); App.toast(t().resent);
  }
  async function verify() {
    const s = state; if (s.code.length !== LEN || s.busy) return;
    s.busy = true; const btn = s.el.querySelector('#auGo'); if (btn) btn.setAttribute('aria-busy', 'true');
    let r;
    try { r = PHONE ? await sb.auth.verifyOtp({ phone: '+' + s.phone, token: s.code, type: 'sms' }) : await sb.auth.verifyOtp({ email: s.email, token: s.code, type: 'email' }); }
    catch (e) { r = { error: e }; }
    s.busy = false;
    if (r.error || !r.data || !r.data.session) {
      // Supabase gives one error for a wrong and an expired code: a code older than its life reads as expired
      s.err = Date.now() - s.sentAt > CODE_LIFE ? 'expired' : 'wrong';
      draw(); return;
    }
    await finish(r.data.session);
  }
  async function finish(sess) {
    const s = state; if (!s || s.done) return;
    s.done = true; clearInterval(s.timer);
    // a new account: keep the name (and email) on the profile
    if (s.from === 'signup' && s.name) { try { await sb.rpc('save_profile_v2', { p_name: s.name.trim(), p_email: (s.email || '').trim() || null }); } catch (e) {} }
    profCache = null;
    document.body.classList.remove('auth-on');
    s.el.innerHTML = '';
    const p = await profile();
    s.opts.onReady && s.opts.onReady(sess, p);
  }

  async function mount(el, opts = {}) {
    if (!sb) { el.innerHTML = `<div class="scr au"><div class="scr-main"><h1 class="scr-h">${t().notReady}</h1><p class="scr-p">${t().notReadyP}</p></div></div>`; return; }
    const sess = await session();
    if (sess) { const p = await profile(); opts.onReady && opts.onReady(sess, p); return; }
    document.body.classList.add('auth-on');
    const start = opts.start || (opts.audience === 'guest' ? 'login' : 'welcome');
    state = { el, opts, step: start, name: '', email: '', phone: '', phoneRaw: '', code: '', err: null, sentAt: 0, from: start === 'signup' ? 'signup' : 'login' };
    draw();
    new MutationObserver(() => { if (state && !state.done) draw(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['lang'] });
    // the email's magic link, opened on this phone, also logs in
    sb.auth.onAuthStateChange((ev, sess2) => { if (ev === 'SIGNED_IN' && sess2 && state && !state.done) { state.from = state.from || 'login'; finish(sess2); } });
  }

  // tests: make the sent code look older than it is (03c "expired")
  const age = ms => { if (state) state.sentAt -= ms; };

  window.SinaAuth = { mount, session, profile, signOut, phoneMode: PHONE, codeLength: LEN, __age: age };
})();

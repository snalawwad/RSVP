// Sina demo: a private copy of sample data that lives in this browser only.
// It stands in for the real server (Supabase) so the app and website can be tried with no login
// and without touching real events. Load it first, before any other script on the page.
(function () {
  'use strict';
  var API = 'https://mock.supabase.test';
  var PGLITE = null;   // set below: our own copy (Safari won't load its add-ons from another site)
  var DB_NAME = 'idb://sina-demo-v3', FLAG = 'sina-demo-v3-ready';
  var HERE = (document.currentScript && document.currentScript.src) || location.href;
  var BASE = HERE.replace(/[^/]*$/, '');                       // …/RSVP/demo/
  var DEMO_EMAIL = 'host@sina.test';
  PGLITE = BASE + 'pglite/';

  // ---------- tokens (same shape the real server gives) ----------
  function b64uEnc(o) { return btoa(unescape(encodeURIComponent(JSON.stringify(o)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
  function b64uDec(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; return JSON.parse(decodeURIComponent(escape(atob(s)))); }
  function userOf(who) {
    var o = typeof who === 'object' && who ? who : { email: who };
    var key = o.email || o.phone || 'x', h = 0;
    for (var i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
    return { email: o.email || null, phone: o.phone || null, sub: o.sub || ('00000000-0000-0000-0000-' + ('000000000000' + h.toString(16)).slice(-12)) };
  }
  function jwtFor(u) { var c = { sub: u.sub, role: 'authenticated', aud: 'authenticated', exp: 4102444800 }; if (u.email) c.email = u.email; if (u.phone) c.phone = u.phone; return b64uEnc({ alg: 'HS256', typ: 'JWT' }) + '.' + b64uEnc(c) + '.demo'; }
  function sessionFor(who) {
    var u = userOf(who);
    return { access_token: jwtFor(u), token_type: 'bearer', expires_in: 3600, expires_at: 4102444800, refresh_token: 'demo-' + (u.email || u.phone),
      user: { id: u.sub, email: u.email || '', phone: u.phone || '', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } };
  }
  function claimsOf(auth) { try { return b64uDec(String(auth || '').replace(/^Bearer /, '').split('.')[1]); } catch (e) { return {}; } }

  // ---------- reset, and signed in from the start ----------
  try {
    if (/[?&]reset=1/.test(location.search)) { localStorage.removeItem(FLAG); localStorage.removeItem('sb-mock-auth-token'); indexedDB.deleteDatabase('/pglite/sina-demo-v3'); }
    if (!localStorage.getItem('sb-mock-auth-token')) localStorage.setItem('sb-mock-auth-token', JSON.stringify(sessionFor(DEMO_EMAIL)));
  } catch (e) {}

  // ---------- the database (in this browser) ----------
  var ready = (async function () {
    var mod = await import(PGLITE + 'index.js');
    var crypto_ = await import(PGLITE + 'contrib/pgcrypto.js');
    var opts = { extensions: { pgcrypto: crypto_.pgcrypto }, relaxedDurability: false };   // save every change before the next page opens
    var fresh = true; try { fresh = !localStorage.getItem(FLAG); } catch (e) {}
    if (fresh) {
      var res = await fetch(BASE + 'demo-db.tar.gz?v=3');
      opts.loadDataDir = await res.blob();
      try { indexedDB.deleteDatabase('/pglite/sina-demo-v3'); indexedDB.deleteDatabase('/pglite/sina-demo-v1'); indexedDB.deleteDatabase('/pglite/sina-demo-v2'); localStorage.removeItem('sina-demo-v1-ready'); localStorage.removeItem('sina-demo-v2-ready'); } catch (e) {}
    }
    var db;
    try { db = await mod.PGlite.create(DB_NAME, opts); }
    catch (e) {   // private browsing or no storage: keep it in memory for this page
      if (!opts.loadDataDir) opts.loadDataDir = await (await fetch(BASE + 'demo-db.tar.gz?v=3')).blob();
      db = await mod.PGlite.create(opts);
    }
    try { localStorage.setItem(FLAG, '1'); } catch (e) {}
    return db;
  })();
  ready.catch(function (e) { console.error('Sina demo could not start', e); });

  var q = Promise.resolve();
  function serial(fn) { q = q.then(fn, fn); return q; }

  async function asRole(db, auth, fn) {
    var c = claimsOf(auth), email = c.email || null, phone = c.phone || null, sub = (email || phone) ? (c.sub || null) : null;
    await db.query('reset role');
    await db.query('update auth.ctx set email = $1, phone = $2, sub = $3', [email, phone, sub]);
    if (sub) await db.query('insert into auth.users(id, email, phone) values ($1, $2, $3) on conflict (id) do nothing', [sub, email, phone]);
    await db.exec(email || phone ? 'set role authenticated' : 'set role anon');
    try { return await fn(); } finally { await db.query('reset role'); }
  }
  function ident(s) { if (!/^[a-z_][a-z0-9_]*$/.test(s)) throw new Error('bad name ' + s); return '"' + s + '"'; }
  function where(params, vals) {
    var w = [];
    params.forEach(function (kv) {
      var k = kv[0], v = kv[1];
      if (['select', 'order', 'limit', 'on_conflict', 'columns', 'offset'].indexOf(k) >= 0) return;
      var m = v.match(/^(eq|neq|is|in)\.(.*)$/); if (!m) return;
      if (m[1] === 'is') { w.push(ident(k) + (m[2] === 'null' ? ' is null' : ' is not null')); return; }
      if (m[1] === 'in') { vals.push(m[2].replace(/^\(|\)$/g, '').split(',')); w.push(ident(k) + '::text = any($' + vals.length + ')'); return; }
      vals.push(m[2]); w.push(ident(k) + '::text ' + (m[1] === 'eq' ? '=' : '<>') + ' $' + vals.length);
    });
    return w.length ? ' where ' + w.join(' and ') : '';
  }
  function cols(sel) { return !sel || sel === '*' ? '*' : sel.split(',').map(function (c) { return ident(c.trim()); }).join(', '); }

  async function rest(db, url, method, headers, body) {
    var u = new URL(url), p = u.pathname.replace('/rest/v1/', '');
    return asRole(db, headers.authorization, async function () {
      if (p.indexOf('rpc/') === 0) {
        var fn = p.slice(4);
        var info = (await db.query("select p.proretset from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname=$1", [fn])).rows[0];
        if (!info) return { status: 404, json: { code: 'PGRST202', message: 'Could not find the function public.' + fn } };
        var vals = [], args = Object.entries(body || {});
        var call = 'public.' + ident(fn) + '(' + args.map(function (a) { vals.push(a[1] === null ? null : typeof a[1] === 'object' ? JSON.stringify(a[1]) : a[1]); return ident(a[0]) + ' => $' + vals.length; }).join(', ') + ')';
        if (info.proretset) { var r1 = await db.query('select to_jsonb(x) j from ' + call + ' x', vals); return { status: 200, json: r1.rows.map(function (r) { return r.j; }) }; }
        var r2 = await db.query('select to_jsonb(' + call + ') j', vals); return { status: 200, json: r2.rows[0].j };
      }
      var table = 'public.' + ident(p), params = Array.from(u.searchParams.entries()), vals2 = [];
      var single = String(headers.accept || '').indexOf('vnd.pgrst.object') >= 0;
      var ret = function (rows) { return single ? (rows.length === 1 ? { status: 200, json: rows[0] } : { status: 406, json: { code: 'PGRST116', message: 'not one row' } }) : { status: 200, json: rows }; };
      var sel = u.searchParams.get('select');
      if (method === 'GET' || method === 'HEAD') {
        var sql = 'select ' + cols(sel) + ' from ' + table + where(params, vals2);
        var o = u.searchParams.get('order'); if (o) sql += ' order by ' + o.split(',').map(function (x) { var cd = x.split('.'); return ident(cd[0]) + (cd[1] === 'desc' ? ' desc' : ' asc'); }).join(', ');
        var lim = u.searchParams.get('limit'); if (lim && /^\d+$/.test(lim)) sql += ' limit ' + lim;
        return ret((await db.query(sql, vals2)).rows);
      }
      if (method === 'POST') {
        var rows = Array.isArray(body) ? body : [body], keys = [];
        rows.forEach(function (r) { Object.keys(r).forEach(function (k) { if (keys.indexOf(k) < 0) keys.push(k); }); });
        var vs = rows.map(function (r) { return '(' + keys.map(function (k) { vals2.push(r[k] === undefined ? null : (r[k] !== null && typeof r[k] === 'object' && !Array.isArray(r[k]) ? JSON.stringify(r[k]) : r[k])); return '$' + vals2.length; }).join(', ') + ')'; }).join(', ');
        var ins = 'insert into ' + table + ' (' + keys.map(ident).join(', ') + ') values ' + vs;
        var oc = u.searchParams.get('on_conflict'); if (oc && /ignore-duplicates/.test(headers.prefer || '')) ins += ' on conflict (' + oc.split(',').map(ident).join(', ') + ') do nothing';
        return ret((await db.query(ins + ' returning ' + cols(sel), vals2)).rows);
      }
      if (method === 'PATCH') {
        var set = Object.entries(body).map(function (e) { vals2.push(e[1] !== null && typeof e[1] === 'object' && !Array.isArray(e[1]) ? JSON.stringify(e[1]) : e[1]); return ident(e[0]) + ' = $' + vals2.length; }).join(', ');
        return ret((await db.query('update ' + table + ' set ' + set + where(params, vals2) + ' returning ' + cols(sel), vals2)).rows);
      }
      if (method === 'DELETE') return ret((await db.query('delete from ' + table + where(params, vals2) + ' returning *', vals2)).rows);
      return { status: 405, json: {} };
    }).catch(function (e) { return { status: 400, json: { code: e.code || 'XX000', message: e.message } }; });
  }

  async function other(db, url, method, headers, body) {
    var p = new URL(url).pathname;
    if (p === '/auth/v1/otp') return { status: 200, json: {} };
    if (p === '/auth/v1/verify') return { status: 200, json: sessionFor(body && body.phone ? { phone: String(body.phone).replace(/\D/g, '') } : (body && body.email) || DEMO_EMAIL) };
    if (p === '/auth/v1/user') { var c = claimsOf(headers.authorization); return c.email || c.phone ? { status: 200, json: sessionFor({ email: c.email, phone: c.phone, sub: c.sub }).user } : { status: 401, json: { msg: 'no' } }; }
    if (p === '/auth/v1/token') { var who = String((body && body.refresh_token) || '').replace(/^demo-/, '') || DEMO_EMAIL; return { status: 200, json: sessionFor(/@/.test(who) ? who : { phone: who }) }; }
    if (p === '/auth/v1/logout') return { status: 204, json: null };
    if (p === '/functions/v1/checkout') return { status: 200, json: { url: BASE + 'web/pay.html?order=' + body.order_id, mode: 'test', order_id: body.order_id } };
    if (p === '/functions/v1/checkout-test') {
      var fn = body.outcome === 'paid' ? '_v2_mark_paid' : '_v2_mark_failed';
      await db.query('reset role');
      var r = await db.query('select public.' + fn + '($1, $2, $3) j', [body.order_id, 'test', 'demo-' + Date.now()]);
      return { status: 200, json: { order_id: body.order_id, status: (r.rows[0].j || {}).status || body.outcome } };
    }
    if (p.indexOf('/functions/v1/') === 0) return { status: 200, json: { ok: true } };
    if (p.indexOf('/storage/v1/object/public/') === 0) return { redirect: BASE + 'web/card.jpg' };
    if (p.indexOf('/storage/v1/object/') === 0) { var name = decodeURIComponent(p.replace(/^\/storage\/v1\/object\/[^/]+\//, '')); return { status: 200, json: { Key: name, Id: name } }; }
    return { status: 404, json: {} };
  }

  var realFetch = window.fetch.bind(window);
  var CORS = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
  window.fetch = async function (input, init) {
    var url = typeof input === 'string' ? input : (input && input.url) || String(input);
    if (url.indexOf(API) !== 0) return realFetch(input, init);
    var req = input instanceof Request ? input : null;
    var method = String((init && init.method) || (req && req.method) || 'GET').toUpperCase();
    var h = {}; new Headers((init && init.headers) || (req && req.headers) || {}).forEach(function (v, k) { h[k.toLowerCase()] = v; });
    if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    var raw = init && init.body != null ? init.body : (req ? await req.clone().text() : null);
    var body = null; if (typeof raw === 'string' && raw) { try { body = JSON.parse(raw); } catch (e) { body = null; } }
    var db = await ready;
    var r = await serial(function () { return new URL(url).pathname.indexOf('/rest/v1/') === 0 ? rest(db, url, method, h, body) : other(db, url, method, h, body); });
    if (r.redirect) return realFetch(r.redirect);
    return new Response(r.json == null ? null : JSON.stringify(r.json), { status: r.status, headers: CORS });
  };

  // ---------- realtime (live updates) has no demo server: stay quiet instead of retrying ----------
  var RealWS = window.WebSocket;
  window.WebSocket = function (u, p) { if (String(u).indexOf('mock.supabase.test') >= 0) { var f = { readyState: 3, send: function () {}, close: function () {}, addEventListener: function () {}, removeEventListener: function () {} }; return f; } return new RealWS(u, p); };
  window.WebSocket.prototype = RealWS.prototype; ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'].forEach(function (k, i) { window.WebSocket[k] = i; });

  // ---------- a small "Demo" tag so nobody mistakes it for the real thing ----------
  function tag() {
    if (document.getElementById('sinaDemoTag')) return;
    var a = document.createElement('a');
    a.id = 'sinaDemoTag'; a.href = '?reset=1'; a.title = 'Sample data in this browser only. Tap to start over.';
    a.textContent = 'Demo · start over';
    a.setAttribute('style', 'position:fixed;z-index:2147483647;left:8px;bottom:calc(96px + env(safe-area-inset-bottom));font:600 11px/1 system-ui,sans-serif;padding:6px 9px;border-radius:999px;background:rgba(91,15,29,.86);color:#fff;text-decoration:none;opacity:.85');
    a.addEventListener('click', function (e) { if (!confirm('Start the demo over with fresh sample data?')) e.preventDefault(); });
    document.body.appendChild(a);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tag); else tag();
})();

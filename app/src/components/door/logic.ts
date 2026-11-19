// Door logic, ported line by line from door.html (search, ordering, row states, head counts).
// The name matching itself (spellings, Arabic ↔ Latin) is lib/names.ts (= core.js nameScore/searchNames);
// this file adds the door's letter-for-letter highlight, phone search, tiers and ordering.
import type { DoorGuest } from '../../lib/api';
import { allowed, leftOf } from '../../lib/guests';
import { asciiDigits, searchNames } from '../../lib/names';

export const MAX_OVER = 6;            // the stepper goes up to "left + 6"
export const MAX_ASK = 20;            // the ask sheet's top count
export const ANS_SHOWN = 2;           // answers shown before "Show n more"
export const BAND_MS = 120000;        // the green band stays 2 minutes (or until the next check-in)
export const UNDO_MS = 600000;        // "Just arrived" rows keep Undo for 10 minutes

export { allowed, leftOf };

// ---------- the letter-for-letter match (door.html nmap / squash / matchName), for <mark> ----------
const FOLD: Record<string, string> = { 'أ': 'ا', 'إ': 'ا', 'آ': 'ا', 'ٱ': 'ا', 'ة': 'ه', 'ى': 'ي', 'ؤ': 'و', 'ئ': 'ي' };
type NMap = { n: string; map: number[] };
/** normalised text plus, for each character, where it came from in the original */
export function nmap(s: string): NMap {
  s = String(s || '');
  let n = '';
  const map: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let c = s[i];
    if (/[ً-ْـ]/.test(c)) continue;          // Arabic diacritics and tatweel
    c = FOLD[c] || c.toLowerCase();
    if (/[\s\-_.'’‘`ʼ,()]/.test(c)) c = ' ';
    if (c === ' ' && (!n || n.endsWith(' '))) continue;
    for (const ch of c) { n += ch; map.push(i); }
  }
  if (n.endsWith(' ')) { n = n.slice(0, -1); map.pop(); }
  return { n, map };
}
const squash = (m: NMap): NMap => {
  let n = '';
  const map: number[] = [];
  for (let i = 0; i < m.n.length; i++) if (m.n[i] !== ' ') { n += m.n[i]; map.push(m.map[i]); }
  return { n, map };
};
const stripAl = (tk: string) => { const s = tk.replace(/^(al|el|ال)/, ''); return s !== tk && s.length >= 3 ? s : null; };
export type Range = [number, number];
/** every token found in the name (in any order), with where it sits in the original; null if one is missing */
export function matchName(name: string, tokens: string[]): { ranges: Range[] } | null {
  const a = nmap(name), b = squash(a), ranges: Range[] = [];
  for (const tk of tokens) {
    let i = a.n.indexOf(tk), m = a, len = tk.length;
    if (i < 0) { i = b.n.indexOf(tk); m = b; }
    if (i < 0) { const s = stripAl(tk); if (s) { i = a.n.indexOf(s); m = a; len = s.length; } }
    if (i < 0) return null;
    ranges.push([m.map[i], m.map[i + len - 1] + 1]);
  }
  return { ranges };
}
export const tokensOf = (q: string) => nmap(q).n.split(' ').filter(Boolean);

/** cut a string into plain / marked pieces */
export function pieces(s: string, ranges?: Range[]): { t: string; mark: boolean }[] {
  s = String(s || '');
  if (!ranges || !ranges.length) return [{ t: s, mark: false }];
  const r = ranges.slice().sort((x, y) => x[0] - y[0]), out: { t: string; mark: boolean }[] = [];
  let at = 0;
  for (const [a0, b0] of r) {
    const a = Math.max(a0, at);
    if (b0 <= a) continue;
    if (a > at) out.push({ t: s.slice(at, a), mark: false });
    out.push({ t: s.slice(a, b0), mark: true });
    at = b0;
  }
  if (at < s.length) out.push({ t: s.slice(at), mark: false });
  return out;
}

// ---------- search ----------
export const isDigits = (q: string) => !/[^\d\s+\-()٠-٩۰-۹]/.test(q);
export const digitsOf = (q: string) => asciiDigits(q).replace(/\D/g, '');

// ---------- door pass (supabase/migrations/0005) ----------
/** "SN-4821", "sn 4821", "SN4821", "SN-" (typing), Arabic digits too: the digits typed so far, else null ("sn" alone is a name) */
export const codeQuery = (q: string): string | null => {
  const m = /^\s*sn\s*(?:[-–—]\s*([\d٠-٩۰-۹]{0,4})|([\d٠-٩۰-۹]{1,4}))\s*$/i.exec(String(q || ''));
  return m ? asciiDigits(m[1] ?? m[2] ?? '') : null;
};
/** Does this list carry pass codes (0005 installed)? */
export const hasCodes = (list: DoorGuest[]) => list.some((g) => !!g.pass_code);
/** How a pass code is shown: SN- and Latin digits, in both languages */
export const passLabel = (code: string) => 'SN-' + code;
/**
 * What a scanned QR carries: <site>/door.html#p=<key> (or ?p= / &p=), or the bare key.
 * Returns the key, or null when it isn't a door pass at all (another QR code, a web page, a phone number).
 */
export function parsePass(data: string): string | null {
  const s = String(data || '').trim();
  const m = /[#?&]p=([A-Za-z0-9_-]+)/.exec(s);
  const k = m ? m[1] : s;
  return /^[A-Za-z0-9_-]{22,64}$/.test(k) ? k : null;
}
/** score bands from nameScore: 5 same name · 4 starts with · 3 word starts · 2 inside · 1 other spelling/script · 0 close */
export const tierOf = (s: number) => (s >= 100 ? 5 : s >= 80 ? 4 : s >= 60 ? 3 : s >= 45 ? 2 : s >= 30 ? 1 : 0);

export type Hit = { g: DoorGuest; score: number; tier: number; ranges?: Range[]; phone?: string; code?: boolean };

export function search(list: DoorGuest[], q: string): Hit[] {
  // the pass code (SN-4821): only that guest. Four bare digits also try the code, before the phone numbers.
  const cq = hasCodes(list) ? codeQuery(q) : null;
  if (cq != null) return cq.length === 4 ? list.filter((g) => g.pass_code === cq).map((g) => ({ g, score: 100, tier: 5, code: true })) : [];
  if (isDigits(q)) {
    const qd = digitsOf(q);
    if (qd.length < 4) return [];
    const byCode = qd.length === 4 ? list.filter((g) => g.pass_code === qd) : [];
    const coded = new Set(byCode.map((g) => g.id));
    return [
      ...byCode.map((g) => ({ g, score: 101, tier: 5, code: true })),
      ...list.filter((g) => !coded.has(g.id) && (g.phone || '').includes(qd)).map((g) => ({ g, score: 100, tier: 5, phone: qd })),
    ];
  }
  const tokens = tokensOf(q);
  let hits: Hit[] = searchNames(list, q).map(({ item, score }) => ({ g: item, score, tier: tierOf(score), ranges: matchName(item.name, tokens)?.ranges }));
  // last resort: the old letter-for-letter match, shown as a close spelling
  if (!hits.length) {
    hits = list.map((g) => ({ g, m: matchName(g.name, tokens) })).filter((x) => x.m).map((x) => ({ g: x.g, score: 1, tier: 0, ranges: x.m!.ranges }));
  }
  return hits;
}

// ---------- row states ----------
export type RowState = 'open' | 'part' | 'wait' | 'no' | 'all';
const ORDER: Record<RowState, number> = { open: 0, part: 1, wait: 2, no: 3, all: 4 };
export function stateOf(g: DoorGuest, v2: boolean): RowState {
  if (!v2) return g.checked_in_at ? 'all' : g.status === 'no' ? 'no' : g.status === 'pending' ? 'wait' : 'open';
  const done = g.checked_in_count || 0, left = leftOf(g);
  if (left > 0) return g.status === 'pending' ? 'wait' : done ? 'part' : 'open';
  return done ? 'all' : 'no';
}
/** the head count on the stepper: what the door chose, else everyone still to come (1 at least) */
export const curN = (g: DoorGuest, typed: Record<string, number>) => {
  const left = leftOf(g);
  return Math.max(1, Math.min(left + MAX_OVER, typed[g.id] || left || 1));
};

/**
 * The results, ordered like door.html renderList: anyone already inside who matches comes first (amber), then
 * best tier, then state, then score, then name. Also: the "similar names" set, the top tier, letters typed.
 */
export function orderHits(list: DoorGuest[], q: string, v2: boolean) {
  const hits = search(list, q);
  if (!hits.length) return { hits, top: -1, sim: [] as Hit[], letters: 0 };
  const top = Math.max(...hits.map((h) => h.tier)), phoneQ = isDigits(q) || (hasCodes(list) && codeQuery(q) != null);
  const letters = phoneQ ? 0 : nmap(q).n.replace(/ /g, '').length;
  const sim = phoneQ ? ((hits[0].phone || '').length >= 8 ? hits : []) : letters >= 2 ? hits.filter((h) => h.tier >= 1) : hits.filter((h) => h.tier === top && top >= 1);
  const simSet = new Set(sim);
  const inFirst = (h: Hit) => (simSet.has(h) && stateOf(h.g, v2) === 'all' ? 0 : 1);
  hits.sort((a, b) => inFirst(a) - inFirst(b) || b.tier - a.tier || ORDER[stateOf(a.g, v2)] - ORDER[stateOf(b.g, v2)] || b.score - a.score || a.g.name.localeCompare(b.g.name));
  return { hits, top, sim, letters };
}

/** where the typed digits sit in the shown phone number */
export function phoneRanges(shown: string, digits?: string): Range[] | undefined {
  if (!digits) return undefined;
  const i = shown.indexOf(digits);
  return i < 0 ? [] : [[i, i + digits.length]];
}

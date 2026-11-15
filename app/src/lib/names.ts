// Name matching across spellings and scripts. A straight port of core.js (nameKey / nameScore / searchNames).
// nameKey(s): one comparable form of a name. Arabic: no tashkeel/tatweel, one alef, ة→ه, ى→ي, ؤ→و, ئ→ي,
// no hamza, no leading ال. Latin: lower case, no accents, y→i, ou/oo→u, ee/ie→i, ph→f, no doubled letters,
// no word-final h after a vowel, no separate Al-/El-.
// nameScore(query, name): 0 = no match; higher = better.
//   100 same name · 80-89 name starts with the query · 60-69 each query word starts a name word
//   45-54 the query is inside the name · 30-42 same name in another spelling or script (Maryam/مريم)
//   15-24 nearly the same (one letter off, or still typing in the other script)

/** Arabic-Indic and Persian digits → 0-9 (Arabic phone keyboards type these). */
export const asciiDigits = (s: string) =>
  String(s || '').replace(/[٠-٩]/g, (c) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(c))).replace(/[۰-۹]/g, (c) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(c)));

/** Simple normalisation: ignores capitals, Arabic diacritics and the usual spelling variants. */
export const normName = (s: string) => String(s || '').toLowerCase()
  .replace(/[ً-ْـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي')
  .replace(/\s+/g, ' ').trim();

// Anything that isn't a letter or digit splits words. Unicode property escapes, with a plain fallback for older engines.
const NON_WORD: RegExp = (() => {
  try { return new RegExp('[^\\p{L}\\p{N}]+', 'gu'); } catch { return /[^0-9A-Za-z\u00C0-\u024F\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]+/g; }
})();
const AR_MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g;
const AR_LETTER = /[ء-يٮ-ۓ]/;
const arWord = (w: string) => {
  w = w.replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/[ىی]/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/ء/g, '').replace(/ک/g, 'ك');
  if (w.length >= 4 && w.startsWith('ال')) w = w.slice(2);
  return w.replace(/(.)\1+/g, '$1');
};
const latWord = (w: string) => w.replace(/ph/g, 'f').replace(/y/g, 'i').replace(/ou|oo/g, 'u').replace(/ee|ie/g, 'i')
  .replace(/([a-z])\1+/g, '$1').replace(/([aeiou])h$/, '$1');
function keyWords(s: string) {
  const t = asciiDigits(String(s || '')).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(AR_MARKS, '').toLowerCase()
    .replace(/['’‘`ʿʾ]/g, '').replace(NON_WORD, ' ').trim();
  if (!t) return [] as string[];
  const w = t.split(' ').map((x) => (AR_LETTER.test(x) ? arWord(x) : latWord(x))).filter(Boolean);
  const rest = w.filter((x) => !/^(al|el|ال)$/.test(x));
  return rest.length ? rest : w;
}
export const nameKey = (s: string) => keyWords(s).join(' ');

// A rough Gulf transliteration skeleton: consonants only, the same for Arabic and Latin spellings.
const AR_SK: Record<string, string> = { 'ب': 'b', 'ت': 't', 'ث': 't', 'ج': 'j', 'ح': 'h', 'خ': 'X', 'د': 'd', 'ذ': 'd', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'S', 'ص': 's',
  'ض': 'd', 'ط': 't', 'ظ': 'd', 'غ': 'G', 'ف': 'f', 'ق': 'k', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'پ': 'b', 'چ': 'S', 'گ': 'G', 'ڤ': 'f' };
function skel(w: string) {
  let s: string;
  if (AR_LETTER.test(w)) s = [...w].map((c) => AR_SK[c] || (/\d/.test(c) ? c : '')).join('');
  else if (/^\d+$/.test(w)) s = w;
  else s = w.replace(/sh|ch/g, 'S').replace(/kh/g, 'X').replace(/gh/g, 'G').replace(/th/g, 't').replace(/dh/g, 'd')
    .replace(/ck|q|c|k/g, 'k').replace(/g/g, 'G').replace(/x/g, 'ks').replace(/p/g, 'b').replace(/v/g, 'f')
    .replace(/[32]/g, '').replace(/7/g, 'h').replace(/5/g, 'X').replace(/6/g, 't').replace(/9/g, 's')
    .replace(/[aeiouwy]/g, '');
  return s.length > 1 ? s.replace(/h$/, '') : s;
}
// Does the word start with a vowel sound? (i/ي can be either: Ibrahim/Yousef, إبراهيم/يوسف)
const vowelStart = (w: string): boolean | null => (/^[iي]/.test(w) ? null : /^[aeouاع]/.test(w));
type Form = { sk: string; v: boolean | null };
type Word = { w: string; ar: boolean; forms: Form[]; sk: string; v: boolean | null };
function analyse(word: string): Word {
  const ar = AR_LETTER.test(word), forms: Form[] = [{ sk: skel(word), v: vowelStart(word) }];
  // "Alotaibi" written as one word: also try it without the Al
  if (!ar && /^(al|el)[a-z]{3,}/.test(word)) forms.push({ sk: skel(word.slice(2)), v: vowelStart(word.slice(2)) });
  return { w: word, ar, forms, sk: forms[0].sk, v: forms[0].v };
}
type Info = { key: string; words: Word[]; flat: string };
const nameMemo = new Map<string, Info>();
function nameInfo(s: string): Info {
  s = String(s || '');
  const hit = nameMemo.get(s);
  if (hit) return hit;
  const words = keyWords(s);
  const ws = words.map(analyse);
  const r: Info = { key: words.join(' '), words: ws, flat: ws.map((x) => x.sk).join('') };
  if (nameMemo.size > 5000) nameMemo.clear();
  nameMemo.set(s, r);
  return r;
}
function lev1(a: string, b: string) {
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
function wordLevel(q: Word, n: Word, last: boolean) {
  if (q.w === n.w) return 3;
  const vow = (a: Form, b: Form) => a.v === null || b.v === null || a.v === b.v;   // Ahmad is not Hamad
  // short skeletons in the same script are too loose (Laila/Lulwa): there the spelling must be one letter off at most
  const close = q.ar !== n.ar ? (q.sk || q.w.length + n.w.length <= 8) : (q.sk.length > 2 || lev1(q.w, n.w));
  if (close && q.forms.some((a) => n.forms.some((b) => vow(a, b) && a.sk === b.sk && (a.sk || !b.sk)))) return 2;
  if (last && q.w.length >= 3 && q.sk.length >= 2 && n.forms.some((b) => vow(q, b) && b.sk.length > q.sk.length && b.sk.startsWith(q.sk))) return 1;
  if (q.ar === n.ar && q.w.length >= 5 && n.w.length >= 5 && lev1(q.w, n.w)) return 1;
  return 0;
}
export function nameScore(query: string, name: string) {
  const q = nameInfo(query), n = nameInfo(name);
  if (!q.key || !n.key) return 0;
  const bonus = Math.max(0, 9 - Math.floor(Math.max(0, n.key.length - q.key.length) / 2));
  if (q.key === n.key) return 100;
  if (n.key.startsWith(q.key)) return 80 + bonus;
  const nw = n.key.split(' '), qw = q.key.split(' ');
  let from = 0;
  const inOrder = qw.every((w) => { const i = nw.findIndex((x, k) => k >= from && x.startsWith(w)); if (i < 0) return false; from = i + 1; return true; });
  if (inOrder) return 60 + bonus;
  if (q.key.length >= 4 && n.key.includes(q.key)) return 45 + bonus;
  // another spelling or script: every typed word matches a different name word
  const used = new Set<number>();
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
    const parts = n.words.map((x) => x.sk);
    for (let k = 0; k < parts.length; k++) {
      if (q.words[0].v !== null && n.words[k].v !== null && q.words[0].v !== n.words[k].v) continue;
      let acc = '';
      for (let j = k; j < parts.length && acc.length < q.flat.length; j++) { acc += parts[j]; if (acc === q.flat && (j > k || q.words.length > 1)) return 30 + bonus; }
    }
  }
  return 0;
}
/** Sort a list by how well each item's name matches. Best first; ties keep list order. */
export function searchNames<T>(items: readonly T[], query: string, nameOf: (x: T) => string = (x) => (x as { name: string }).name) {
  return (items || []).map((item, i) => ({ item, i, score: nameScore(query, nameOf(item)) }))
    .filter((r) => r.score > 0).sort((a, b) => b.score - a.score || a.i - b.i).map(({ item, score }) => ({ item, score }));
}

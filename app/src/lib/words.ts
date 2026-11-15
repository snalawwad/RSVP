// Every number carries its word (from core.js). kind: 'person' (one head) or 'guest' (one invitation).
// Arabic: 1 شخص واحد · 2 شخصين · 3-10 أشخاص · 11+ شخص (same for ضيف/ضيوف).
export type Lang = 'en' | 'ar';
export type CountKind = 'person' | 'guest';

/** Arabic number agreement: arN(n, one, two, few, many). 1 → one, 2 → two, 3–10 → "n few", else "n many". */
export const arN = (n: number, one: string, two: string, few: string, many: string) =>
  n === 1 ? one : n === 2 ? two : n % 100 >= 3 && n % 100 <= 10 ? `${n} ${few}` : `${n} ${many}`;

const COUNT = {
  person: { en: ['person', 'people'], ar: ['شخص واحد', 'شخصين', 'أشخاص', 'شخص'] },
  guest: { en: ['guest', 'guests'], ar: ['ضيف واحد', 'ضيفين', 'ضيوف', 'ضيف'] },
} as const;

/** "3 people", "1 guest", «شخصين», «5 ضيوف». Zero reads "0 people" / «0 شخص» (door wording). */
export function countWord(n: number | string, kind: CountKind = 'person', lang: Lang = 'en') {
  const k = Math.max(0, parseInt(String(n), 10) || 0);
  const w = COUNT[kind] ?? COUNT.person;
  if (lang === 'ar') return arN(k, w.ar[0], w.ar[1], w.ar[2], w.ar[3]);
  return `${k} ${k === 1 ? w.en[0] : w.en[1]}`;
}

/** Host-page wording: like countWord, but Arabic zero reads «ولا ضيف» / «ولا أحد» instead of «0 ضيف». */
export function countWordHost(n: number | string, kind: CountKind = 'person', lang: Lang = 'en') {
  if (lang === 'ar' && (Number(n) || 0) === 0) return kind === 'guest' ? 'ولا ضيف' : 'ولا أحد';
  return countWord(n, kind, lang);
}

// One name for the people who run the event, the same on every page:
// English "the hosts", Arabic «أهل المناسبة» (never المضيف / المضيفين / أصحاب المناسبة / صاحبة المناسبة).
export const HOSTS = {
  en: { plain: 'the hosts', cap: 'The hosts', to: 'to the hosts', page: 'Host dashboard' },
  ar: { plain: 'أهل المناسبة', cap: 'أهل المناسبة', to: 'لأهل المناسبة', page: 'صفحة أهل المناسبة' },
} as const;
export type HostForm = keyof typeof HOSTS.en;
/** hostWord('ar', 'to') → «لأهل المناسبة» */
export const hostWord = (lang: Lang, form: HostForm = 'plain') => HOSTS[lang === 'ar' ? 'ar' : 'en'][form] ?? HOSTS.en.plain;

/** The business name, set in type only (no logo). */
export const BRAND = { en: 'Sina', ar: 'سنة' } as const;

/** Keep "+2" in one piece inside Arabic text (first-strong isolate). */
export const iso = (s: string) => `⁨${s}⁩`;
/** Keep a time and its AM/PM (ص/م) together on one line. */
export const nb = (s: string) => String(s || '').replace(/ (ص|م|AM|PM)(?=$|[\s.,،])/g, ' $1');

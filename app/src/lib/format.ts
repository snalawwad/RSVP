// Dates and times, always in Kuwait time (UTC+3 all year, no daylight saving), like the web.
// Built by hand instead of Intl so iOS, Android (Hermes) and web print exactly the same thing as the
// web back office: en-GB dates, en-US times, Arabic with Western digits (ar-KW-u-nu-latn).
import { countWord, nb, type Lang } from './words';

const KW_OFFSET = 3 * 3600e3;
const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const DAYS_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

/** The Kuwait wall-clock parts of an instant. */
export function kwParts(iso: string | number | Date) {
  const d = new Date(new Date(iso).getTime() + KW_OFFSET);
  return { y: d.getUTCFullYear(), m: d.getUTCMonth(), d: d.getUTCDate(), wd: d.getUTCDay(), h: d.getUTCHours(), min: d.getUTCMinutes() };
}

/** "Sunday, 20 December 2026" · «الأحد، 20 ديسمبر 2026» */
export function fmtDate(iso: string | null | undefined, lang: Lang) {
  if (!iso) return '';
  const p = kwParts(iso);
  return lang === 'ar' ? `${DAYS_AR[p.wd]}، ${p.d} ${MONTHS_AR[p.m]} ${p.y}` : `${DAYS_EN[p.wd]}, ${p.d} ${MONTHS_EN[p.m]} ${p.y}`;
}

/** "8:00 PM" · «8:00 م» (time and AM/PM kept on one line) */
export function fmtTime(iso: string | null | undefined, lang: Lang) {
  if (!iso) return '';
  const p = kwParts(iso);
  const h12 = p.h % 12 || 12, mm = String(p.min).padStart(2, '0');
  const ampm = lang === 'ar' ? (p.h < 12 ? 'ص' : 'م') : p.h < 12 ? 'AM' : 'PM';
  return nb(`${h12}:${mm} ${ampm}`);
}

/** "Sun 20 Dec" · «الأحد، 20 ديسمبر» (host masthead) */
export function shortDate(iso: string, lang: Lang) {
  const p = kwParts(iso);
  return lang === 'ar' ? `${DAYS_AR[p.wd]}، ${p.d} ${MONTHS_AR[p.m]}` : `${DAYS_EN[p.wd].slice(0, 3)} ${p.d} ${MONTHS_EN[p.m].slice(0, 3)}`;
}
/** "Sunday 20 December" · «الأحد، 20 ديسمبر» */
export function dayMonth(iso: string, lang: Lang) {
  const p = kwParts(iso);
  return lang === 'ar' ? `${DAYS_AR[p.wd]}، ${p.d} ${MONTHS_AR[p.m]}` : `${DAYS_EN[p.wd]} ${p.d} ${MONTHS_EN[p.m]}`;
}
/** "20 Dec" · «20 ديسمبر» (door event list) */
export function dayMon(iso: string, lang: Lang) {
  const p = kwParts(iso);
  return lang === 'ar' ? `${p.d} ${MONTHS_AR[p.m]}` : `${p.d} ${MONTHS_EN[p.m].slice(0, 3)}`;
}

/** Kuwait calendar day "2026-12-20" of an instant. */
export const kwDay = (iso: string | number | Date) => new Date(new Date(iso).getTime() + KW_OFFSET).toISOString().slice(0, 10);
/** Days from today to the event (Kuwait dates): 0 on the night, negative after. null without a date. */
export function daysTo(iso: string | null | undefined, now: Date = new Date()) {
  if (!iso) return null;
  return Math.round((new Date(kwDay(iso)).getTime() - new Date(kwDay(now)).getTime()) / 864e5);
}
/** From a date + time typed in Kuwait time to an ISO string. */
export const kwToIso = (date: string, time?: string) => (date ? new Date(`${date}T${time || '20:00'}:00+03:00`).toISOString() : null);
/** ISO → { date: 'YYYY-MM-DD', time: 'HH:MM' } in Kuwait time. */
export function isoToKw(iso: string | null | undefined) {
  if (!iso) return { date: '', time: '' };
  const d = new Date(new Date(iso).getTime() + KW_OFFSET).toISOString();
  return { date: d.slice(0, 10), time: d.slice(11, 16) };
}
/** Whole minutes since an instant (for "5 min ago"; the words are in t.host.mins / t.door.ago). */
export const minutesAgo = (iso: string | number, now = Date.now()) => Math.max(0, Math.round((now - new Date(iso).getTime()) / 6e4));

/** Count people (heads), not invitations. Kept from the first version of the app. */
export function tally(guests: { seats: number; status: string; checked_in_at: string | null; checked_in_count: number | null; confirmed_count?: number | null }[]) {
  const t = { coming: 0, pending: 0, declined: 0, arrived: 0, invited: 0 };
  for (const g of guests) {
    t.invited += g.seats;
    if (g.status === 'yes') t.coming += g.confirmed_count || g.seats;
    else if (g.status === 'no') t.declined += g.seats;
    else t.pending += g.seats;
    if (g.checked_in_at) t.arrived += g.checked_in_count || g.seats;
  }
  return t;
}

export { countWord };

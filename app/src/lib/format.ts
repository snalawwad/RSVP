// Dates and times always in Kuwait time, like the web app.
import type { Lang } from '../i18n/strings';

const TZ = 'Asia/Kuwait';
const locale = (lang: Lang) => (lang === 'ar' ? 'ar-KW' : 'en-GB');

export function fmtDate(iso: string | null, lang: Lang) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString(locale(lang), { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function fmtTime(iso: string | null, lang: Lang) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString(lang === 'ar' ? 'ar-KW' : 'en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' });
}

// Count people (seats), not messages.
export function tally(guests: { seats: number; status: string; checked_in_at: string | null; checked_in_count: number | null }[]) {
  const t = { coming: 0, pending: 0, declined: 0, arrived: 0, invited: 0 };
  for (const g of guests) {
    t.invited += g.seats;
    if (g.status === 'yes') t.coming += g.seats;
    else if (g.status === 'no') t.declined += g.seats;
    else t.pending += g.seats;
    if (g.checked_in_at) t.arrived += g.checked_in_count ?? g.seats;
  }
  return t;
}

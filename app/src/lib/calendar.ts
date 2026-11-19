// Add an invitation to a calendar (Figma G11b / G11c).
//  - iPhone: the system "New Event" form from expo-calendar (SDK 58 API: requestCalendarPermissions(true) asks
//    for write-only access, then getDefaultCalendarSync().addEventWithForm), with a reminder 3 hours before.
//  - Elsewhere, or if the person says no: Google Calendar in the browser, or the system share sheet with the date.
import { Linking, Platform, Share } from 'react-native';
import { fmtDate, fmtTime } from './format';
import type { Lang } from './words';

export type CalEvent = { title: string; starts_at: string; ends_at?: string | null; venue?: string | null; map_url?: string | null; notes?: string | null };
const endOf = (e: CalEvent) => (e.ends_at ? new Date(e.ends_at) : new Date(new Date(e.starts_at).getTime() + 3 * 3600e3));

/** 'saved' | 'canceled' | 'unavailable' (no phone calendar here: offer the other ways) | 'denied' */
export async function addToPhoneCalendar(e: CalEvent): Promise<'saved' | 'canceled' | 'unavailable' | 'denied'> {
  if (Platform.OS !== 'ios') return 'unavailable';
  try {
    const Calendar = await import('expo-calendar');
    const perm = await Calendar.requestCalendarPermissions(true);
    if (!perm.granted) return 'denied';
    const cal = Calendar.getDefaultCalendarSync();
    const r = await cal.addEventWithForm({
      title: e.title, startDate: new Date(e.starts_at), endDate: endOf(e), location: e.venue || undefined, notes: e.notes || undefined,
      alarms: [{ relativeOffset: -180 }],
    });
    return r.action === 'saved' ? 'saved' : 'canceled';
  } catch {
    return 'unavailable';
  }
}

const gstamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
/** Google Calendar's "add event" page with everything filled in (opens in the browser; nothing is bought). */
export function openGoogleCalendar(e: CalEvent) {
  const q = new URLSearchParams({ action: 'TEMPLATE', text: e.title, dates: `${gstamp(new Date(e.starts_at))}/${gstamp(endOf(e))}`, location: e.venue || '', details: e.map_url || '' });
  return Linking.openURL(`https://calendar.google.com/calendar/render?${q.toString()}`).catch(() => {});
}

/** The system share sheet with the date, time and place. */
export function shareDate(e: CalEvent, lang: Lang) {
  const lines = [e.title, `${fmtDate(e.starts_at, lang)} · ${fmtTime(e.starts_at, lang)}`, e.venue || '', e.map_url || ''].filter(Boolean);
  return Share.share({ message: lines.join('\n') }).catch(() => {});
}

// Invite links, WhatsApp messages and templates (from core.js and host.html).
import { Linking } from 'react-native';
import { config } from './config';
import { fmtDate, fmtTime } from './format';
import type { Lang } from './words';

export const siteUrl = () => config.siteUrl.replace(/\/$/, '');
/** A guest's personal reply link. */
export const inviteLink = (token: string) => `${siteUrl()}/invite.html?t=${token}`;
/** The event's group link (anyone with it can reply). */
export const publicLink = (code: string) => `${siteUrl()}/invite.html?e=${code}`;
/** wa.me link with the message filled in. phone = digits with country code. */
export const waLink = (phone: string, text: string) => `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
/** Opens WhatsApp (the app if installed, else the web). Resolves false if nothing could open it. */
export async function openWhatsApp(phone: string, text: string) {
  try { await Linking.openURL(waLink(phone, text)); return true; } catch { return false; }
}
/** Share text to a WhatsApp group (no number): the person picks the chat. */
export async function shareWhatsApp(text: string) {
  try { await Linking.openURL(`https://wa.me/?text=${encodeURIComponent(text)}`); return true; } catch { return false; }
}

export type TemplateEvent = { starts_at: string | null; lang: Lang | string; venue?: string | null; headline?: string | null; title?: string | null; message_template?: string | null };
export type TemplateGuest = { name: string; seats: number; token: string };

/** Fills {name}/{الاسم}, {invites}/{العدد}, {date}/{التاريخ}, {time}/{الوقت}, {venue}/{المكان}, {event}/{المناسبة}, {link}/{الرابط}. */
export function fillTemplate(tpl: string, ev: TemplateEvent, g: TemplateGuest) {
  const lang: Lang = ev.lang === 'en' ? 'en' : 'ar';
  return String(tpl || '')
    .replace(/{(الاسم|name)}/g, g.name)
    .replace(/{(العدد|invites)}/g, String(g.seats))
    .replace(/{(التاريخ|date)}/g, fmtDate(ev.starts_at, lang))
    .replace(/{(الوقت|time)}/g, fmtTime(ev.starts_at, lang))
    .replace(/{(المكان|venue)}/g, ev.venue || '')
    .replace(/{(المناسبة|event)}/g, ev.headline || ev.title || '')
    .replace(/{(الرابط|link)}/g, inviteLink(g.token));
}
// core.js DEFAULT_TEMPLATE (date only) is kept for comparison; the host page's Arabic default carries the time too.
export const DEFAULT_TEMPLATE = 'حياكم الله {الاسم}\n\nنتشرف بدعوتكم لحضور {المناسبة} يوم {التاريخ}.\n\nعدد الدعوات: {العدد}\nلتأكيد الحضور أو الاعتذار:\n{الرابط}';
export const DEFAULT_TEMPLATE_EN = 'Hello {name} 🤍\n\nYou’re invited to {event} on {date} at {time}.\n\nPlease tap your personal link to RSVP:\n{link}';
export const AR_DEFAULT = 'حياكم الله {الاسم}\n\nنتشرف بدعوتكم لحضور {المناسبة} يوم {التاريخ} الساعة {الوقت}.\n\nعدد الأشخاص: {العدد}\nلتأكيد الحضور أو الاعتذار:\n{الرابط}';
/** The default invitation message for an invite language (host.html defTpl). */
export const defaultTemplate = (lang: string) => (lang === 'en' ? DEFAULT_TEMPLATE_EN : AR_DEFAULT);
/** Is this message one of the defaults (so it follows the invite language)? */
export const isDefaultTemplate = (s: string | null | undefined) => [DEFAULT_TEMPLATE_EN, AR_DEFAULT, DEFAULT_TEMPLATE].includes(String(s || '').replace(/\s+$/, ''));
/** The event's own message, or the default for its invite language. */
export const templateFor = (ev: TemplateEvent) => ev.message_template || defaultTemplate(String(ev.lang));

// Phones: stored as digits with the country code. 8-digit numbers are treated as Kuwaiti (from core.js).
import { asciiDigits } from './names';

/** "5577 1754", "+965 5577-1754", "٥٥٧٧١٧٥٤" → "96555771754" */
export function normPhone(p: string | null | undefined) {
  let d = asciiDigits(String(p || '')).replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.length === 8) d = '965' + d;
  return d;
}
/** Kuwaiti numbers without the 965; others with a +. Show inside an LTR isolate in Arabic text. */
export const showPhone = (p: string | null | undefined) => ((p || '').startsWith('965') && (p || '').length === 11 ? (p as string).slice(3) : '+' + (p || ''));

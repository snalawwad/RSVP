// Reading a pasted list of guests (host.html fromLines/findPhone): a name and a number on each line,
// +965 / 00965 / 965, international numbers, 8-digit Kuwaiti numbers, an optional people count after the number,
// and the lines it couldn't read (listed, never dropped without a word).
import { clampSeats } from '../../lib/guests';
import { asciiDigits } from '../../lib/names';
import { normPhone } from '../../lib/phone';

export type Parsed = { name: string; phone: string; seats: number };

export const isPhone = (v: unknown) => { const p = normPhone(String(v ?? '')); return p.length >= 10 && p.length <= 15 && !/[a-zA-Zء-ي]/.test(String(v)); };

const PHONE_RES = [/(?<![\d+])(?:\+|00)?965[\s-]?\d{4}[\s-]?\d{4}(?!\d)/, /(?<![\d+])(?:\+|00)[1-9][\d\s-]{6,}\d(?!\d)/, /(?<![\d+])\d{4}[\s-]?\d{4}(?!\d)/, /(?<![\d+])\+?\d[\d\s-]{6,}\d/];
function findPhone(l: string) {
  const L = asciiDigits(l);   // same length: Arabic digits become Western ones in place
  for (const re of PHONE_RES) {
    const m = L.match(re); if (!m || m.index == null) continue;
    let at = m.index, len = m[0].length;
    // "Noura 2 447700900123": a short number before a space ends the name, it isn't the start of the phone
    const head = m[0].match(/^(\d{1,3})[\s-]+/);
    if (head && isPhone(m[0].slice(head[0].length))) { at += head[0].length; len -= head[0].length; }
    const tail = L.slice(at, at + len).match(/\s([1-6])$/);
    if (tail && isPhone(L.slice(at, at + len - tail[0].length))) len -= tail[0].length;   // "+44 7700 900123 3": the 3 is the people count
    if (isPhone(L.slice(at, at + len))) return { i: at, len };
  }
  return null;
}

export function fromLines(lines: string[]) {
  const out: Parsed[] = [], bad: string[] = []; let pending: string | null = null;
  lines.map((l) => l.trim()).filter(Boolean).forEach((l) => {
    const ph = findPhone(l);
    if (ph) {
      let after = l.slice(ph.i + ph.len), seats = 1;
      const sm = asciiDigits(after).match(/^[\s,;|:–-]*([1-6])\s*$/);
      if (sm) { seats = +sm[1]; after = ''; }
      const rest = (l.slice(0, ph.i) + ' ' + after).replace(/[-–:,|]/g, ' ').replace(/\s+/g, ' ').trim();
      const own = /[ء-يa-zA-Z]/.test(rest), name = own ? rest : pending;
      if (own && pending) bad.push(pending);   // a name on its own line, then a line with its own name: the first one had no number
      if (name) out.push({ name, phone: normPhone(l.slice(ph.i, ph.i + ph.len)), seats: clampSeats(seats) }); else bad.push(l);
      pending = null;
    } else if (/[ء-يa-zA-Z]/.test(l) && !/^(الاسم|name|الرقم|phone)/i.test(l)) { if (pending) bad.push(pending); pending = l; }
    else if (/[\d٠-٩]/.test(l)) bad.push(l);
  });
  if (pending) bad.push(pending);
  return { rows: out, bad };
}

export const dedupe = (list: Parsed[]) => { const seen = new Set<string>(); return list.filter((g) => !seen.has(g.phone) && !!seen.add(g.phone)); };

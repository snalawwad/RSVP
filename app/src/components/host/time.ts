// "just now", "5 min ago", "yesterday", then a short date (host.html ago()).
import { useCallback } from 'react';
import { shortDate } from '../../lib/format';
import { useApp } from '../../providers/AppProvider';

export function useAgo() {
  const { t, lang } = useApp();
  return useCallback((iso: string) => {
    const T = t.host;
    const m = Math.round((Date.now() - new Date(iso).getTime()) / 6e4);
    if (m < 1) return T.justNow;
    if (m < 60) return T.mins(m);
    const h = Math.round(m / 60); if (h < 24) return T.hrs(h);
    const d = Math.round(h / 24); return d < 7 ? T.days(d) : shortDate(iso, lang);
  }, [t, lang]);
}

// One invitation by its token (get_invite_v2), shared by the invite page, the door pass and the reply screens.
import { useCallback, useEffect, useState } from 'react';
import { getInvite } from '../../lib/api7';
import type { InviteView } from '../../lib/types7';

export type InviteState = { kind: 'loading' } | { kind: 'gone' } | { kind: 'not_ready' } | { kind: 'error' } | { kind: 'ok'; inv: InviteView };

export function useInvite(token: string) {
  const [st, setSt] = useState<InviteState>({ kind: 'loading' });
  const load = useCallback(async () => {
    const r = await getInvite(token);
    if (r.error) { setSt((s) => (s.kind === 'ok' ? s : { kind: 'error' })); return; }
    if (!r.data) { setSt({ kind: 'gone' }); return; }
    if (r.data.closed) { setSt({ kind: 'not_ready' }); return; }
    setSt({ kind: 'ok', inv: r.data });
  }, [token]);
  useEffect(() => {
    let off = false;
    getInvite(token).then((r) => {
      if (off) return;
      if (r.error) setSt({ kind: 'error' });
      else if (!r.data) setSt({ kind: 'gone' });
      else if (r.data.closed) setSt({ kind: 'not_ready' });
      else setSt({ kind: 'ok', inv: r.data });
    });
    return () => { off = true; };
  }, [token]);
  return { st, reload: load, set: (inv: InviteView) => setSt({ kind: 'ok', inv }) };
}

/** The people coming on a yes (the reply's count, else the whole invitation). */
export const comingOf = (inv: Pick<InviteView, 'status' | 'confirmed_count' | 'seats'>) => (inv.status === 'yes' ? inv.confirmed_count || inv.seats || 1 : 0);

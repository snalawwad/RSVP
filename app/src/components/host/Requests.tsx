// The door's requests (host.html reqCard): who is asking, for how many, what we know about them,
// then "Let them in" (only the first one filled) and "Turn them down" (6 seconds to undo).
import { View } from 'react-native';
import { peopleComing } from '../../lib/guests';
import { useApp } from '../../providers/AppProvider';
import { space } from '../../theme/tokens';
import { Button } from '../Button';
import { Txt } from '../Txt';
import { useHost } from './HostContext';
import { useAgo } from './time';
import type { DoorRequest } from '../../lib/api';

export function RequestCard({ r, first, onDone }: { r: DoorRequest; first: boolean; onDone?: () => void }) {
  const { t, c } = useApp();
  const T = t.host;
  const h = useHost();
  const ago = useAgo();
  const g = r.guest_id ? h.guests.find((x) => x.id === r.guest_id) : null;
  const nm = h.reqName(r);
  const sub: string[] = [];
  if (!r.guest_id) { if (nm) sub.push(T.notOnList); }
  else if (g) sub.push(T.ctxAllowed(g.seats || 1), g.status === 'yes' ? T.ctxYes(peopleComing(g)) : g.status === 'no' ? T.ctxNo : T.ctxPend, T.ctxIn(g.checked_in_count || 0));
  return (
    <View testID={`req-${r.id}`} style={{ gap: 4, paddingVertical: 14, borderTopWidth: 1, borderTopColor: c.line }}>
      <Txt v="name">{nm || T.notOnList}</Txt>
      <Txt v="button">{T.reqAsk(r.people, !!r.guest_id)}</Txt>
      {sub.length ? <Txt v="small">{sub.join(T.ctxSep)}</Txt> : null}
      {r.note ? <Txt v="body">{`“${r.note}”`}</Txt> : null}
      <Txt v="small">{T.asked(ago(r.created_at))}</Txt>
      <View style={{ gap: space[2], marginTop: 10 }}>
        <Button big block kind={first ? 'primary' : 'secondary'} icon="check" label={T.letIn} busy={h.busyReq === r.id} testID={`req-ok-${r.id}`}
          onPress={async () => { if (await h.approve(r.id)) onDone?.(); }} />
        <Button kind="danger" label={T.turnDown} style={{ alignSelf: 'center' }} testID={`req-no-${r.id}`} onPress={() => { h.turnDown(r.id); onDone?.(); }} />
      </View>
    </View>
  );
}


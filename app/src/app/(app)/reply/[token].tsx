// Change your reply (Figma G12 139:3800) → Reply updated (G13 139:3841), through respond_v2 with the guest's token
// (the same call the web invite page makes). Coming: how many (up to the invitation's people). Can't come: an
// optional message to the hosts.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { Button, Choice, Field, PageTitle, Screen, Stepper, Txt } from '../../../components';
import { InfoRow, InviteGate } from '../../../components/guest/parts';
import { comingOf, useInvite } from '../../../components/guest/useInvite';
import { respond } from '../../../lib/api7';
import { haptics } from '../../../lib/haptics';
import type { GuestStatus } from '../../../lib/types';
import type { InviteView } from '../../../lib/types7';
import { useApp } from '../../../providers/AppProvider';
import { space } from '../../../theme/tokens';

export default function ChangeReply() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const { t } = useApp();
  const A = t.a;
  const { st, reload } = useInvite(String(token));
  const [done, setDone] = useState<InviteView | null>(null);
  if (done) return <Updated inv={done} />;
  if (st.kind !== 'ok') return <Screen testID="reply"><Stack.Screen options={{ title: A.yourInvite }} /><InviteGate st={st} onRetry={reload} /></Screen>;
  return <ReplyForm inv={st.inv} token={String(token)} onDone={setDone} />;
}

function ReplyForm({ inv, token, onDone }: { inv: InviteView; token: string; onDone: (v: InviteView) => void }) {
  const { t } = useApp();
  const A = t.a;
  const seats = Math.max(1, inv.seats || 1);
  const [pick, setPick] = useState<GuestStatus | null>(inv.status === 'pending' ? null : inv.status === 'yes' ? 'yes' : 'no');
  const [count, setCount] = useState(inv.status === 'yes' ? comingOf(inv) : seats);
  const [msg, setMsg] = useState(inv.decline_reason || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const now = inv.status === 'yes' ? A.replyComing(comingOf(inv)) : inv.status === 'no' ? A.replyNo : A.replyNone;
  const yesL = inv.status === 'yes' ? A.stillComing : A.yesComing, yesP = inv.status === 'yes' ? A.stillComingP : A.yesComingP;
  const noL = inv.status === 'yes' ? A.cantNow : A.cant, noP = inv.status === 'yes' ? A.cantNowP : A.cantP;
  const same = pick === inv.status && (pick !== 'yes' || count === comingOf(inv)) && (pick !== 'no' || msg.trim() === (inv.decline_reason || ''));

  async function save() {
    if (!pick || busy) return;
    setBusy(true); setErr('');
    const r = await respond(token, pick, pick === 'yes' ? Math.min(count, seats) : null, pick === 'no' ? msg.trim() || null : null);
    setBusy(false);
    if (r.error || !r.data) {
      const m = r.error?.message || '';
      setErr(/RSVP_CLOSED/.test(m) ? A.closed : /CHANGES_LOCKED/.test(m) ? A.locked : /NOT_READY/.test(m) ? A.notReady : t.host.cantSave('other'));
      haptics.error();
      return;
    }
    haptics.success();
    onDone(r.data);
  }

  return (
    <Screen testID="reply" gap={space[4]} footer={<Button block kind="primary" label={A.update} onPress={save} busy={busy} disabled={!pick || same} testID="update-reply" />}>
      <Stack.Screen options={{ title: A.yourInvite }} />
      <PageTitle sub={A.rightNow(now)}>{A.changeH}</PageTitle>
      <View accessibilityRole="radiogroup" style={{ gap: 10 }}>
        <Choice on={pick === 'yes'} title={yesL} sub={yesP} onPress={() => setPick('yes')} testID="pick-yes">
          {pick === 'yes' && seats > 1 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap', marginTop: space[3] }}>
              <Txt v="body">{A.howMany}</Txt>
              <Stepper value={count} min={1} max={seats} label={A.howMany} lessLabel={t.host.less} moreLabel={t.host.more} onChange={setCount} testID="reply-count" />
            </View>
          ) : null}
        </Choice>
        <Choice on={pick === 'no'} title={noL} sub={noP} onPress={() => setPick('no')} testID="pick-no" />
      </View>
      {pick === 'no' ? <Field label={A.msgTo(A.theHosts)} value={msg} onChangeText={setMsg} maxLength={500} multiline testID="reply-msg" /> : null}
      {err ? <Txt v="small" tone="no" accessibilityRole="alert" testID="reply-err">{err}</Txt> : null}
    </Screen>
  );
}

function Updated({ inv }: { inv: InviteView }) {
  const { t } = useApp();
  const A = t.a;
  const s = inv.status === 'yes' ? A.replyComing(comingOf(inv)) : inv.status === 'no' ? A.replyNo : A.replyNone;
  return (
    <Screen testID="reply-done" gap={space[4]} footer={<Button block kind="primary" label={A.backToInvite} onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} testID="back-to-invite" />}>
      <Stack.Screen options={{ title: A.yourInvite }} />
      <PageTitle sub={A.toldP(s)}>{A.toldH(A.theHosts)}</PageTitle>
      <View>
        <InfoRow top icon={inv.status === 'no' ? 'x' : 'people'} title={s} testID="done-status" />
        {inv.status === 'no' && inv.decline_reason ? <InfoRow icon="pen" title={`“${inv.decline_reason}”`} sub={A.yourMsg} /> : null}
      </View>
    </Screen>
  );
}

// Send one by one (host.html startQueue/drawQueue): invitations, reminders and change notices.
// WhatsApp opens for one guest at a time. A guest is marked as sent (or reminded) only when the host says
// "Yes, it's sent" — opening WhatsApp alone changes nothing. Back from WhatsApp (AppState), the question waits;
// the sheet doesn't close around it.
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, AppState, Easing, Platform, View } from 'react-native';
import { haptics } from '../../lib/haptics';
import { openWhatsApp } from '../../lib/links';
import { showPhone } from '../../lib/phone';
import { useApp } from '../../providers/AppProvider';
import { fonts, radius, scriptOf, space } from '../../theme/tokens';
import { Button } from '../Button';
import { useToast } from '../Feedback';
import { Icon } from '../Icon';
import { Panel } from '../Panel';
import { useAnimValue } from '../Press';
import { Sheet } from '../Sheet';
import { Txt } from '../Txt';
import { useHost } from './HostContext';
import { Meta, Paper } from './parts';

export function SendQueue() {
  const { t, c, reduceMotion } = useApp();
  const T = t.host;
  const h = useHost();
  const toast = useToast();
  const q = h.queue;
  const [tick, setTick] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nudged, setNudged] = useState(false);
  const shake = useAnimValue(0);
  const qRef = useRef(q);
  useEffect(() => { qRef.current = q; });
  // the short "sent" tick before the next guest; closing the sheet (or a new queue) cancels it (host.html: sq !== cur)
  const tickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stopTick = () => { if (tickTimer.current) clearTimeout(tickTimer.current); tickTimer.current = null; };
  useEffect(() => stopTick, []);

  const asking = !!(q && q.asking && !q.answered);
  // back from WhatsApp: the question is waiting
  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => {
      const cur = qRef.current;
      if (s === 'active' && cur && cur.asking && !cur.answered) {
        const g = h.guests.find((x) => x.id === cur.ids[cur.i]);
        if (g) { if (Platform.OS !== 'web') AccessibilityInfo.announceForAccessibility(T.askSent(g.name)); haptics.tap(); }
      }
    });
    return () => sub.remove();
  }, [h.guests, T]);

  if (!q) return <Sheet visible={false} onClose={() => {}} title=""><View /></Sheet>;
  const set = (patch: Partial<typeof q>) => h.setQueue({ ...q, ...patch });
  const close = () => { if (asking) { nudge(); return; } stopTick(); qRef.current = null; h.setQueue(null); setTick(null); };
  function nudge() {
    haptics.warn(); setNudged(true); setTimeout(() => setNudged(false), 900);
    if (reduceMotion) return;
    shake.setValue(0);
    Animated.timing(shake, { toValue: 1, duration: 420, easing: Easing.linear, useNativeDriver: Platform.OS !== 'web' }).start();
  }

  const n = q.ids.length;
  let body: React.ReactNode;
  if (!n || q.i >= n) {
    body = (
      <View testID="sq-end" style={{ alignItems: 'center', paddingTop: space[2], paddingBottom: 6, gap: space[2] }}>
        <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: c.okBg, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" lg color={c.ok} /></View>
        <Txt v="title" center>{!n ? T.sqNone[q.mode] : T.endT(q.done.size, q.skipped.size)}</Txt>
        <Txt v="body" tone="muted" center style={{ marginBottom: space[3] }}>{T.sqEndP}</Txt>
        <Button big block kind="primary" label={T.close} onPress={close} testID="sq-close" />
      </View>
    );
  } else {
    const g = h.guests.find((x) => x.id === q.ids[q.i]);
    if (!g) { setTimeout(() => set({ asking: false, answered: false, i: q.i + 1 }), 0); return null; }
    const msg = h.msgFor(q.mode, g), rd = h.remDays(g.id);
    const meta = [showPhone(g.phone), h.cw(g.seats || 1), rd != null && q.mode === 'remind' ? T.remAgo(rd) : null];
    const head = (
      <>
        {n > 1 ? (
          <View style={{ gap: 6 }}>
            <Txt v="label" tone="muted">{T.sqOf(q.i + 1, n)}</Txt>
            <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.surface, overflow: 'hidden' }}>
              <View style={{ height: 6, width: `${Math.round((q.i / n) * 100)}%`, backgroundColor: c.okMark, borderRadius: radius.pill }} />
            </View>
          </View>
        ) : null}
        <View>
          <Txt v="title" testID="sq-name" style={{ fontFamily: scriptOf(g.name) === 'ar' ? fonts.arDisplayBold : fonts.display }}>{g.name}</Txt>
          <Meta bits={meta.filter(Boolean) as string[]} />
        </View>
      </>
    );
    if (q.asking) {
      const tx = shake.interpolate({ inputRange: [0, 0.2, 0.45, 0.7, 1], outputRange: [0, -6, 5, -3, 0] });
      body = (
        <View style={{ gap: space[3] }}>
          {head}
          <Animated.View style={{ transform: [{ translateX: tx }] }}>
            <Panel tone="wait" gap={space[2]} style={nudged && reduceMotion ? { borderColor: c.waitMark, borderWidth: 3 } : undefined} testID="sq-ask">
              <Txt v="name" accessibilityRole="header">{T.askSent(g.name)}</Txt>
              <Txt v="small" tone="ink">{T.askHelp}</Txt>
              <View style={{ flexDirection: 'row', gap: space[2], marginTop: space[1] }}>
                <Button big kind="primary" icon="check" label={T.yesSent} busy={busy} style={{ flex: 3 }} testID="sq-yes" onPress={async () => {
                  setBusy(true);
                  const cur = q;
                  if (cur.mode === 'send' && !(await h.markSent(g.id))) { setBusy(false); return; }
                  if (cur.mode === 'remind') h.setReminded(g.id);
                  setBusy(false);
                  const done = new Set(cur.done); done.add(g.id);
                  h.setQueue({ ...cur, answered: true, done });
                  haptics.success();
                  setTick(T.doneTo[cur.mode](g.name));
                  stopTick();
                  tickTimer.current = setTimeout(() => {
                    tickTimer.current = null;
                    setTick(null);
                    // closed meanwhile, or another queue started: leave it alone
                    const live = qRef.current;
                    if (!live || live.ids !== cur.ids || live.i !== cur.i) return;
                    // a single guest: close and say so; a list: straight on to the next guest
                    if (cur.ids.length === 1) { qRef.current = null; h.setQueue(null); toast(T.doneTo[cur.mode](g.name)); return; }
                    h.setQueue({ ...cur, done, asking: false, answered: false, i: cur.i + 1 });
                  }, 650);
                }} />
                <Button big kind="secondary" label={T.notYet} style={{ flex: 2 }} testID="sq-no" onPress={() => set({ asking: false })} />
              </View>
            </Panel>
          </Animated.View>
          <Button kind="quiet" block icon="whatsapp" label={T.openAgain} testID="sq-again" onPress={() => { openWhatsApp(g.phone || '', msg); }} />
          {tick ? (
            <View accessibilityRole="alert" testID="sq-tick" style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0, backgroundColor: c.card, borderRadius: radius.l, alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
              <View style={{ width: 64, height: 64, borderRadius: 32, borderWidth: 1.6, borderColor: c.okMark, alignItems: 'center', justifyContent: 'center' }}><Icon name="check" lg color={c.ok} /></View>
              <Txt v="button" tone="ok" center>{tick}</Txt>
            </View>
          ) : null}
        </View>
      );
    } else {
      body = (
        <View style={{ gap: space[3] }}>
          {head}
          <Paper testID="sq-msg">{msg}</Paper>
          <Button big block kind="primary" icon="whatsapp" label={T.openWa} testID="sq-go" onPress={() => { openWhatsApp(g.phone || '', msg); set({ asking: true }); }} />
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {n > 1 ? <Button kind="secondary" label={T.skip} style={{ flex: 1 }} testID="sq-skip" onPress={() => { const skipped = new Set(q.skipped); skipped.add(g.id); set({ skipped, i: q.i + 1 }); }} /> : null}
            <Button kind="quiet" label={T.doneForNow} style={{ flex: 1 }} testID="sq-stop" onPress={close} />
          </View>
        </View>
      );
    }
  }
  return (
    <Sheet visible title={T.sqH[q.mode]} onClose={close} closeLabel={T.close} testID="sendq">
      {body}
    </Sheet>
  );
}

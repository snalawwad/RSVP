// Updates (Sama's Figma 24o): who replied to your events, invitations sent to you, and drafts from our team waiting
// for your yes ("Your design changes are ready", opens 24p), newest first.
// New since you last looked get a plum dot; opening this screen clears the count on the tab.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Busy, PageTitle, Txt } from '../../components';
import { Initial } from '../../components/host/EventPage';
import { peopleComing } from '../../lib/guests';
import { isNew, lastSeen, loadUpdates, markSeen, type Update } from '../../lib/updates';
import { useApp } from '../../providers/AppProvider';
import { bodyFont, mix, radius, scriptOf } from '../../theme/tokens';

function ago(iso: string | null, A: { agoMin: (n: number) => string; agoH: (n: number) => string; yesterday: string; agoD: (n: number) => string }) {
  if (!iso) return '';
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60e3));
  if (m < 60) return A.agoMin(m);
  if (m < 24 * 60) return A.agoH(Math.round(m / 60));
  if (m < 48 * 60) return A.yesterday;
  return A.agoD(Math.round(m / 1440));
}

export default function Updates() {
  const { t, c, email, lang, rtl } = useApp();
  const A = t.a;
  const [items, setItems] = useState<Update[] | null>(null);
  const [seen, setSeen] = useState(lastSeen());
  const [refreshing, setRefreshing] = useState(false);
  const load = useCallback(async (force = false) => {
    const before = lastSeen();
    const list = await loadUpdates(email, force).catch(() => []);
    setSeen(before); setItems(list); markSeen();
  }, [email]);
  useFocusEffect(useCallback(() => { void load(true); }, [load]));

  const row = (u: Update) => {
    const fresh = isNew(u, seen);
    let title = '', sub = '', letter = '?', tone: 'ok' | 'no' | 'wait' = 'wait', go = () => {};
    if (u.kind === 'reply') {
      const g = u.guest, more = Math.max(0, peopleComing(g) - 1);
      const nm = `\u2068${g.name}\u2069`;   // an Arabic name inside an English line (or the other way) keeps its place
      title = g.status === 'yes' ? A.upComing(nm, more) : A.upCant(nm);
      sub = lang === 'ar' && u.eventHeadline ? u.eventHeadline : u.eventTitle; letter = g.name.trim().charAt(0).toUpperCase(); tone = g.status === 'yes' ? 'ok' : 'no';
      go = () => router.push(`/event/${u.eventId}` as never);
    } else if (u.kind === 'draft') {
      const ev = lang === 'ar' && u.eventHeadline ? u.eventHeadline : u.eventTitle;
      title = A.upDraftH; sub = A.upDraftP; letter = ev.trim().charAt(0).toUpperCase() || '?'; tone = 'wait';
      go = () => router.push(`/event/${u.eventId}/review/${u.requestId}` as never);
    } else {
      const e = u.invite.event;
      title = A.upInvited(`\u2068${e.title}\u2069`); sub = e.starts_at ? new Date(e.starts_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
      letter = e.title.trim().charAt(0).toUpperCase(); tone = 'wait';
      go = () => router.push({ pathname: '/invite/[token]', params: { token: u.token } });
    }
    return (
      <Pressable key={u.id} accessibilityRole="button" onPress={go} testID={`up-${u.id}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 16, minHeight: 92, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: pressed ? mix(c.bg, c.ink, 0.04) : 'transparent' })}>
        <Initial name={letter} tone={tone} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          {/* the line's direction follows the app's language, so an Arabic name stays at the start of an English line */}
          <Txt v="body" numberOfLines={2} {...({ dir: rtl ? 'rtl' : 'ltr' } as object)}
            style={{ fontSize: 15, lineHeight: 21, writingDirection: rtl ? 'rtl' : 'ltr', fontFamily: bodyFont(scriptOf(title), fresh ? 'semi' : 'regular') }}>{title}</Txt>
          {sub ? <Txt v="small" tone="muted" numberOfLines={1} style={{ fontSize: 13 }}>{sub}</Txt> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6, minWidth: 64 }}>
          <Txt v="small" tone="muted" style={{ fontSize: 12 }}>{ago(u.at, A)}</Txt>
          {fresh ? <View accessibilityLabel={A.upNew} style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: c.plum }} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['left', 'right', 'bottom']} style={{ flex: 1, backgroundColor: c.bg }} testID="updates">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 48, gap: 14, width: '100%', maxWidth: 760, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={c.plum} colors={[c.plum]} />}>
        <PageTitle testID="updates-title">{A.tabUpdates}</PageTitle>
        {items == null ? <Busy /> : items.length ? <View>{items.map(row)}</View> : (
          <Txt v="body" tone="muted" testID="updates-empty">{A.upEmpty}</Txt>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

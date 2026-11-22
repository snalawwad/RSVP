// Updates (Sama's Figma 24o): who replied to your events, and invitations sent to you, newest first.
// New since you last looked get a plum dot; opening this screen clears the count on the tab.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandBar, Busy, PageTitle, Txt } from '../../components';
import { MainTabBar } from '../../components/MainTabBar';
import { peopleComing } from '../../lib/guests';
import { isNew, lastSeen, loadUpdates, markSeen, type Update } from '../../lib/updates';
import { useApp } from '../../providers/AppProvider';
import { mix, radius, space } from '../../theme/tokens';

function ago(iso: string | null, A: { agoMin: (n: number) => string; agoH: (n: number) => string; yesterday: string; agoD: (n: number) => string }) {
  if (!iso) return '';
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60e3));
  if (m < 60) return A.agoMin(m);
  if (m < 24 * 60) return A.agoH(Math.round(m / 60));
  if (m < 48 * 60) return A.yesterday;
  return A.agoD(Math.round(m / 1440));
}

export default function Updates() {
  const { t, c, email, lang } = useApp();
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
    } else {
      const e = u.invite.event;
      title = A.upInvited(`\u2068${e.title}\u2069`); sub = e.starts_at ? new Date(e.starts_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
      letter = e.title.trim().charAt(0).toUpperCase(); tone = 'wait';
      go = () => router.push({ pathname: '/invite/[token]', params: { token: u.token } });
    }
    const bg = tone === 'ok' ? c.okBg : tone === 'no' ? c.noBg : c.surface;
    return (
      <Pressable key={u.id} accessibilityRole="button" onPress={go} testID={`up-${u.id}`}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[4], borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: pressed ? mix(c.bg, c.ink, 0.04) : 'transparent' })}>
        <View style={{ width: 40, height: 44, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderBottomLeftRadius: 6, borderBottomRightRadius: 6, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="name" style={{ fontSize: 17 }}>{letter}</Txt>
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Txt v="name" numberOfLines={2} style={fresh ? undefined : { fontWeight: '500' }}>{title}</Txt>
          {sub ? <Txt v="small" tone="muted" numberOfLines={1}>{sub}</Txt> : null}
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Txt v="small" tone="muted">{ago(u.at, A)}</Txt>
          {fresh ? <View accessibilityLabel={A.upNew} style={{ width: 8, height: 8, borderRadius: radius.pill, backgroundColor: c.plum }} /> : null}
        </View>
      </Pressable>
    );
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }} testID="updates">
      <BrandBar />
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingTop: space[5], paddingBottom: space[8], gap: space[4], width: '100%', maxWidth: 760, alignSelf: 'center' }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(true); setRefreshing(false); }} tintColor={c.plum} colors={[c.plum]} />}>
        <PageTitle testID="updates-title">{A.tabUpdates}</PageTitle>
        {items == null ? <Busy /> : items.length ? <View>{items.map(row)}</View> : (
          <Txt v="body" tone="muted" testID="updates-empty">{A.upEmpty}</Txt>
        )}
      </ScrollView>
      <MainTabBar active="updates" />
    </SafeAreaView>
  );
}

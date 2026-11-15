// H1 Home (first version): the event, people counts and the way into door mode.
// The full Home from the Figma flows (next action, setup checklist, section tiles) comes in phase 2.
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { RefreshControl, View } from 'react-native';
import { Button, Card, Screen, T } from '../../../components/ui';
import { fmtDate, fmtTime, tally } from '../../../lib/format';
import { supabase, type EventRow, type GuestRow } from '../../../lib/supabase';
import { useApp } from '../../../providers/AppProvider';
import { space } from '../../../theme/tokens';

function Stat({ label, value, color }: { label: string; value: number; color?: string }) {
  const { c } = useApp();
  return (
    <View style={{ flex: 1, minWidth: '45%', backgroundColor: c.surface, borderRadius: 18, padding: space[4], gap: 2 }}>
      <T v="stat" color={color}>{value}</T>
      <T v="label" muted>{label}</T>
    </View>
  );
}

export default function EventHome() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, f, lang, c } = useApp();
  const [ev, setEv] = useState<EventRow | null>(null);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [canSeeGuests, setCanSeeGuests] = useState(false);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [e, g, host] = await Promise.all([
      supabase.from('events').select('id, title, headline, starts_at, venue, lang, invite_limit, card_image_url').eq('id', id).single(),
      supabase.from('guests').select('id, name, seats, status, checked_in_at, checked_in_count').eq('event_id', id),
      supabase.rpc('can_host', { p_event: id }),
    ]);
    setFailed(!!e.error);
    if (e.data) setEv(e.data as EventRow);
    setGuests((g.data as GuestRow[]) ?? []);
    setCanSeeGuests(host.data === true);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));
  const n = tally(guests);

  return (
    <Screen refresh={<RefreshControl refreshing={refreshing} tintColor={c.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      <Stack.Screen options={{ title: '' }} />
      {failed && <T color={c.no}>{t.couldNotLoad}</T>}
      {ev && (
        <>
          <T v="heading1" accessibilityRole="header">{ev.headline || ev.title}</T>
          <T muted>{ev.starts_at ? `${fmtDate(ev.starts_at, lang)} · ${fmtTime(ev.starts_at, lang)}` : t.noDate}</T>
          {!!ev.venue && <T muted>{ev.venue}</T>}

          {canSeeGuests && (
            <>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
                <Stat label={t.coming} value={n.coming} color={c.ok} />
                <Stat label={t.noReply} value={n.pending} color={c.wait} />
                <Stat label={t.declined} value={n.declined} color={c.no} />
                <Stat label={t.arrived} value={n.arrived} />
              </View>
              {ev.invite_limit != null && (
                <Card>
                  <T v="label" muted>{f(t.invitesUsed, { used: n.invited, limit: ev.invite_limit })}</T>
                  <View style={{ height: 8, borderRadius: 8, backgroundColor: c.surface, overflow: 'hidden' }}>
                    <View style={{ height: 8, width: `${Math.min(100, (n.invited / Math.max(1, ev.invite_limit)) * 100)}%`, backgroundColor: c.primary }} />
                  </View>
                </Card>
              )}
            </>
          )}

          <Button label={t.openDoor} kind={canSeeGuests ? 'tertiary' : 'primary'}
            onPress={() => router.push({ pathname: '/door/[id]', params: { id: ev.id } })} />
        </>
      )}
    </Screen>
  );
}

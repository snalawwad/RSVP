// Your events (S3 when empty). Row-level security returns only events this person can see.
import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, Pressable, RefreshControl } from 'react-native';
import { Button, Card, Screen, T } from '../../components/ui';
import { links } from '../../lib/config';
import { fmtDate } from '../../lib/format';
import { supabase, type EventRow } from '../../lib/supabase';
import { useApp } from '../../providers/AppProvider';
import { space } from '../../theme/tokens';

export default function Events() {
  const { t, lang, c } = useApp();
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('events')
      .select('id, title, headline, starts_at, venue, lang, invite_limit, card_image_url')
      .order('starts_at', { ascending: true });
    setFailed(!!error);
    if (!error) setEvents(data as EventRow[]);
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const wa = links.whatsapp(lang === 'ar' ? 'مرحبا، أبي أحجز مناسبة' : 'Hi, I’d like to book an event');

  return (
    <Screen refresh={<RefreshControl refreshing={refreshing} tintColor={c.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}>
      {failed && <T color={c.no}>{t.couldNotLoad}</T>}
      {events && events.length === 0 && (
        <Card style={{ padding: space[6], gap: space[3] }}>
          <T v="heading2" accessibilityRole="header">{t.noEventsTitle}</T>
          <T muted>{t.noEventsSub}</T>
          {wa && <Button label={t.messageUs} onPress={() => Linking.openURL(wa)} />}
        </Card>
      )}
      {events?.map((ev) => (
        <Link key={ev.id} href={{ pathname: '/event/[id]', params: { id: ev.id } }} asChild>
          <Pressable accessibilityRole="button">
            <Card>
              <T v="title">{ev.headline || ev.title}</T>
              <T muted>{ev.starts_at ? fmtDate(ev.starts_at, lang) : t.noDate}</T>
              {!!ev.venue && <T v="caption" muted>{ev.venue}</T>}
            </Card>
          </Pressable>
        </Link>
      ))}
    </Screen>
  );
}

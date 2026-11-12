// D1 door mode: find a guest by name and tap Mark arrived. No QR codes.
// Uses the same database functions as door.html (door_list, check_in_guest).
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, RefreshControl, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Field, StatusPill, T } from '../../../components/ui';
import { fmtTime } from '../../../lib/format';
import { supabase, type DoorGuest } from '../../../lib/supabase';
import { useApp } from '../../../providers/AppProvider';
import { space } from '../../../theme/tokens';

// Arabic-friendly search: ignore case, diacritics and common letter variants.
function norm(s: string) {
  return s.toLowerCase()
    .replace(/[ً-ْـ]/g, '')
    .replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}

export default function Door() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, f, lang, c } = useApp();
  const [guests, setGuests] = useState<DoorGuest[]>([]);
  const [q, setQ] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('door_list', { p_event: id });
    setFailed(!!error);
    if (!error) setGuests((data as DoorGuest[]) ?? []);
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const shown = useMemo(() => {
    const n = norm(q);
    return n ? guests.filter((g) => norm(g.name).includes(n)) : guests;
  }, [guests, q]);

  const expected = guests.filter((g) => g.status !== 'no').reduce((s, g) => s + g.seats, 0);
  const arrived = guests.filter((g) => g.checked_in_at).reduce((s, g) => s + g.seats, 0);

  async function checkIn(g: DoorGuest) {
    setBusyId(g.id);
    const { data, error } = await supabase.rpc('check_in_guest', { p_guest: g.id });
    setBusyId(null);
    if (error || !data?.ok) return Alert.alert(t.checkInFailed);
    setGuests((list) => list.map((x) => (x.id === g.id ? { ...x, checked_in_at: data.checked_in_at } : x)));
  }

  return (
    <SafeAreaView edges={['bottom', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
      <View style={{ padding: space[5], gap: space[3] }}>
        <Field label={t.searchGuests} value={q} onChangeText={setQ} autoCorrect={false} clearButtonMode="while-editing" />
        <T v="label" muted>{f(t.arrivedCount, { n: arrived, total: expected })}</T>
        {failed && <T color={c.no}>{t.couldNotLoad}</T>}
      </View>
      <FlatList
        data={shown}
        keyExtractor={(g) => g.id}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: space[5], paddingBottom: space[10], gap: space[2] }}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={c.primary} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} />}
        ListEmptyComponent={q ? <T muted>{t.noMatches}</T> : undefined}
        renderItem={({ item: g }) => (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3], borderBottomWidth: 1, borderColor: c.line }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="title">{g.name}</T>
              <T v="caption" muted>{g.seats === 1 ? t.seat : f(t.seats, { n: g.seats })}</T>
            </View>
            {g.checked_in_at ? (
              <StatusPill kind="ok" label={f(t.arrivedAt, { time: fmtTime(g.checked_in_at, lang) })} />
            ) : g.status === 'no' ? (
              <StatusPill kind="no" label={t.notComing} />
            ) : (
              <Button label={t.markArrived} onPress={() => checkIn(g)} loading={busyId === g.id} style={{ minHeight: 44, paddingHorizontal: space[4] }} />
            )}
          </View>
        )}
      />
    </SafeAreaView>
  );
}

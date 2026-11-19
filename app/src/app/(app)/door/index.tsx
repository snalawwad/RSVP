// /door: open the door on the right event, like door.html does after login — the one used last on this
// phone, else the next one (Kuwait date), else the last one. No events: say so.
import { Redirect, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Busy, EmptyState } from '../../../components';
import { doorWebBack } from '../../../components/door/parts';
import { loadDoorHome, pickDoorEvent } from '../../../lib/api';
import { KEYS, kv } from '../../../lib/storage';
import { useApp } from '../../../providers/AppProvider';
import { gutter } from '../../../theme/tokens';

export default function DoorHome() {
  const { t, c, email } = useApp();
  const [to, setTo] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    let off = false;
    loadDoorHome(email).then((h) => { if (!off) setTo(pickDoorEvent(h.events, kv.get(KEYS.doorEvent))?.id ?? null); });
    return () => { off = true; };
  }, [email]);
  if (to) return <Redirect href={{ pathname: '/door/[id]', params: { id: to } }} />;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg, padding: gutter }}>
      <Stack.Screen options={{ title: t.door.title, ...doorWebBack }} />
      {to === undefined ? <Busy /> : <EmptyState title={t.door.noEventsH} body={t.door.noEvents} testID="door-none" />}
    </View>
  );
}

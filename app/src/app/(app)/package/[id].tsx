// Your package (Figma 24f 151:4159), read-only: the package's name, how many invites are used of its limit, and
// whether door check-in is part of it. Left out on purpose (Apple: the app takes no payment and doesn't point to
// one): the price, "Need more?", the other packages and "Upgrade".
import { Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Busy, Icon, PageTitle, Screen, Txt } from '../../../components';
import { listGuests } from '../../../lib/api';
import { listPackages, myEvents } from '../../../lib/api7';
import { sumSeats } from '../../../lib/guests';
import type { MyEvent, PackageRow } from '../../../lib/types7';
import { useApp } from '../../../providers/AppProvider';
import { radius, space } from '../../../theme/tokens';

export default function Package() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang, email, c } = useApp();
  const A = t.a;
  const [ev, setEv] = useState<MyEvent | null | undefined>(undefined);
  const [pkg, setPkg] = useState<PackageRow | null>(null);
  const [used, setUsed] = useState(0);

  useEffect(() => {
    let off = false;
    (async () => {
      const [m, g, p] = await Promise.all([myEvents(email), listGuests(String(id)), listPackages()]);
      if (off) return;
      const e = m.data?.find((x) => x.id === id) ?? null;
      setEv(e);
      setUsed(sumSeats(g.data ?? []));
      setPkg((p.data ?? []).find((x) => x.code === e?.package) ?? null);
    })();
    return () => { off = true; };
  }, [id, email]);

  if (ev === undefined) return <Screen><Stack.Screen options={{ title: t.host.tInvite }} /><Busy /></Screen>;
  const lim = ev?.invite_limit ?? pkg?.invite_limit ?? null;
  const name = pkg ? (lang === 'ar' ? pkg.name_ar : pkg.name_en) : A.pkgNone;
  const door = !!(ev?.door || pkg?.door_included || ev?.door_addon);
  const pct = lim ? Math.min(100, (used / lim) * 100) : 0;
  return (
    <Screen gap={space[4]} testID="package">
      <Stack.Screen options={{ title: t.host.tInvite }} />
      <PageTitle>{A.pkgH}</PageTitle>
      <View testID="pkg-card" style={{ padding: space[4], gap: space[2], borderRadius: radius.l, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
        <Txt v="title" style={{ fontSize: 22 }}>{name}</Txt>
        {lim != null ? (
          <>
            <Txt v="body" testID="pkg-used">{A.pkgUsed(used, lim)}</Txt>
            <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: c.surface, overflow: 'hidden' }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={{ height: 8, borderRadius: radius.pill, backgroundColor: used >= lim ? c.noMark : c.plum, width: `${pct}%` }} />
            </View>
            {used >= lim ? <Txt v="small" tone="no" testID="pkg-full">{A.fullH}</Txt> : <Txt v="small">{A.pkgLeft(lim - used)}</Txt>}
          </>
        ) : null}
      </View>
      <View>
        <PkgLine icon="door" label={A.pkgDoor} value={door ? A.included : A.notIncluded} testID="pkg-door" />
        {pkg?.design_included ? <PkgLine icon="sparkle" label={A.pkgDesign} value={A.included} /> : null}
      </View>
    </Screen>
  );
}

function PkgLine({ icon, label, value, testID }: { icon: 'door' | 'sparkle'; label: string; value: string; testID?: string }) {
  const { c } = useApp();
  return (
    <View testID={testID} accessible accessibilityLabel={`${label}: ${value}`} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 56, borderBottomWidth: 1, borderBottomColor: c.line }}>
      <Icon name={icon} color={c.muted} />
      <Txt v="body" style={{ flex: 1 }}>{label}</Txt>
      <Txt v="button">{value}</Txt>
    </View>
  );
}

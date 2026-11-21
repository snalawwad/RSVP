// The host dashboard for one event (host.html): four tabs — Home · Guests · Invite · Arrivals — with no count
// badges. The event, its guests and the door's requests are loaded once here and shared by every tab.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { TabList, Tabs, TabSlot, TabTrigger } from 'expo-router/ui';
import { Linking, Platform, View } from 'react-native';
import { useEffect, useState } from 'react';
import { hasEventRequest } from '../../../../lib/api7';
import { links } from '../../../../lib/config';
import { Busy, Button, Centered, EmptyState, Icon, PressScale, TabBarFrame, TabButton } from '../../../../components';
import { HostProvider, tabHref, useHost, type Tab } from '../../../../components/host/HostContext';
import { DeleteEvent } from '../../../../components/host/DeleteEvent';
import { HostSheets } from '../../../../components/host/HostSheets';
import { useApp } from '../../../../providers/AppProvider';
import { radius, size, space } from '../../../../theme/tokens';

/** Web only: the stack's own back arrow is a 30px target with an English ", back" label there, so the dashboard
 *  gets the same round 44px back button as Menu and Help. Native keeps the system back button. */
function WebBack() {
  const { t, c, rtl } = useApp();
  return (
    <View style={{ marginHorizontal: space[4] }}>
      <PressScale kind="chip" testID="header-back" accessibilityRole="button" accessibilityLabel={t.back} hitSlop={4}
        onPress={() => router.dismissTo('/')}
        style={{ width: size.target, height: size.target, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chev" color={c.plum} flip={!rtl} />
      </PressScale>
    </View>
  );
}
const webBack = Platform.OS === 'web' ? { headerLeft: () => <WebBack /> } : {};

export default function EventLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <HostProvider id={String(id)}>
      <EventTabs id={String(id)} />
    </HostProvider>
  );
}

function EventTabs({ id }: { id: string }) {
  const { t, c, lang } = useApp();
  const h = useHost();
  // a draft made by "Create an event" in the app: say the request arrived (the team finalises it)
  const [requested, setRequested] = useState(false);
  useEffect(() => { if (h.status === 'draft') hasEventRequest(id).then(setRequested); }, [h.status, id]);
  const T = t.host;
  // a co-host has no Invite tab (sending and the invite's words stay with the main host)
  const tabs: { k: Tab; icon: 'home' | 'people' | 'env' | 'door'; label: string }[] = [
    { k: 'home', icon: 'home', label: t.a.overview }, { k: 'guests', icon: 'people', label: T.tGuests },
    ...(h.cohost ? [] : [{ k: 'invite' as Tab, icon: 'env' as const, label: T.tInvite }]), { k: 'arrivals', icon: 'door', label: T.tArr },
  ];
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      {/* the event's name sits in the top bar on every tab except Home (where the one-line title is on the page) */}
      <Stack.Screen options={{ title: h.evName, ...webBack }} />
      <Tabs style={{ flex: 1 }}>
        {/* TabSlot grows to its content by default (flexShrink 0); on web that pushed the tab bar off-screen and
            the page could not scroll. Keep it to the space above the tab bar so each tab's own ScrollView scrolls. */}
        <TabSlot style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0, minHeight: 0 }} />
        <TabList asChild>
          <TabBarFrame>
            {tabs.map((x) => (
              <TabTrigger key={x.k} name={x.k} href={tabHref(id, x.k)} asChild>
                <TabButton icon={x.icon} label={x.label} badge={x.k === 'arrivals' ? h.openReqs.length : 0} testID={`tab-${x.k}`} />
              </TabTrigger>
            ))}
          </TabBarFrame>
        </TabList>
      </Tabs>
      {h.status !== 'ok' ? (
        <View style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}>
          <Centered>
            {h.status === 'loading' ? <Busy /> : h.status === 'door' ? (
              <EmptyState title={T.doorH} body={T.doorP} action={<Button big block kind="primary" icon="door" label={T.doorBtn} onPress={() => router.replace({ pathname: '/door/[id]', params: { id } })} />} />
            ) : h.status === 'draft' ? (
              <View style={{ gap: space[2], alignSelf: 'stretch' }}>
                <EmptyState title={t.a.draftH} body={requested ? t.a.rqDraftP : t.a.draftP} testID="ev-draft"
                action={links.whatsapp(t.a.draftWa(h.me?.title ?? '')) ? <Button kind="primary" icon="whatsapp" label={t.a.whatsappUs}
                  onPress={() => Linking.openURL(links.whatsapp(t.a.draftWa(h.me?.title ?? ''))!).catch(() => {})} testID="draft-wa" /> : undefined} />
                {h.me?.role === 'host' ? <DeleteEvent id={id} title={h.me.title} testID="draft-delete" /> : null}
              </View>
            ) : h.status === 'none' ? (
              <EmptyState title={T.noEvH} body={T.noEvP} />
            ) : (
              <EmptyState title={T.loadErrEv} action={<Button block kind="secondary" label={lang === 'ar' ? 'جربوا مرة ثانية' : 'Try again'} onPress={h.retry} />} />
            )}
          </Centered>
        </View>
      ) : null}
      <HostSheets />
    </View>
  );
}

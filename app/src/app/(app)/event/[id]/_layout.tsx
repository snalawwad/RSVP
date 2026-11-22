// One event (Sama's Figma 24e, 22 Nov): no tabs. The event page (index) holds the replies, Your invite / Your package
// and the guest list; Your invite (invite) and the door's requests (arrivals) open from it with a back button.
// The event, its guests and the door's requests are loaded once here and shared by these pages.
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Linking, View } from 'react-native';
import { useEffect, useState } from 'react';
import { hasEventRequest } from '../../../../lib/api7';
import { links } from '../../../../lib/config';
import { Busy, Button, Centered, EmptyState, Icon, PressScale } from '../../../../components';
import { HostProvider, useHost } from '../../../../components/host/HostContext';
import { DeleteEvent } from '../../../../components/host/DeleteEvent';
import { HostSheets } from '../../../../components/host/HostSheets';
import { useApp } from '../../../../providers/AppProvider';
import { radius, size, space } from '../../../../theme/tokens';

/** The round 44px back button: from Your invite or the arrivals back to the event, from the event back home. */
function Back() {
  const { t, c, rtl } = useApp();
  return (
    <View style={{ marginHorizontal: space[4] }}>
      <PressScale kind="chip" testID="header-back" accessibilityRole="button" accessibilityLabel={t.back} hitSlop={4}
        onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
        style={{ width: size.target, height: size.target, borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="chev" color={c.plum} flip={!rtl} />
      </PressScale>
    </View>
  );
}
const back = { headerLeft: () => <Back />, headerBackVisible: false };

export default function EventLayout() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <HostProvider id={String(id)}>
      <EventPages id={String(id)} />
    </HostProvider>
  );
}

function EventPages({ id }: { id: string }) {
  const { t, c, lang } = useApp();
  const h = useHost();
  // a draft made by "Create an event" in the app: say the request arrived (the team finalises it)
  const [requested, setRequested] = useState(false);
  useEffect(() => { if (h.status === 'draft') hasEventRequest(id).then(setRequested); }, [h.status, id]);
  const T = t.host;
  return (
    <View style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{ title: h.evName, ...back }} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }} />
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

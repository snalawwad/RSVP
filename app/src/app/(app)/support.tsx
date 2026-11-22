// Support (Sama's Figma 24q, 22 Nov): our team on WhatsApp, and the common questions.
import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandBar, PageTitle, Screen, Txt } from '../../components';
import { ListLine } from '../../components/ListLine';
import { MainTabBar, TopIcons } from '../../components/MainTabBar';
import { links } from '../../lib/config';
import { useApp } from '../../providers/AppProvider';
import { space } from '../../theme/tokens';

export default function Support() {
  const { t, c } = useApp();
  const A = t.a;
  const wa = links.whatsapp(A.supportWa);
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }} testID="support">
      <BrandBar end={<TopIcons />} />
      <Screen edges={['left', 'right']} gap={space[4]}>
        <PageTitle sub={<Txt v="body" tone="muted">{A.supportP}</Txt>}>{A.tabSupport}</PageTitle>
        <View>
          {wa ? <ListLine label={A.supportWaL} value={A.supportChat} onPress={() => Linking.openURL(wa).catch(() => {})} testID="support-wa" /> : null}
          <ListLine label={A.supportFaq} onPress={() => router.push('/help')} testID="support-faq" />
        </View>
      </Screen>
      <MainTabBar active="support" />
    </SafeAreaView>
  );
}

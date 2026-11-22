// Support (Sama's Figma 24q, 22 Nov): our team on WhatsApp, and the common questions.
import { router } from 'expo-router';
import { Linking, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandBar, Icon, PageTitle, Screen, Txt } from '../../components';
import { MainTabBar, TopIcons } from '../../components/MainTabBar';
import { links } from '../../lib/config';
import { useApp } from '../../providers/AppProvider';
import { mix, space } from '../../theme/tokens';

export default function Support() {
  const { t, c, rtl } = useApp();
  const A = t.a;
  const wa = links.whatsapp(A.supportWa);
  const line = (label: string, value: string, onPress: () => void, testID: string) => (
    <Pressable accessibilityRole="button" onPress={onPress} testID={testID}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 60, borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: pressed ? mix(c.bg, c.ink, 0.04) : 'transparent' })}>
      <Txt v="body" style={{ flex: 1 }}>{label}</Txt>
      {value ? <Txt v="small" tone="muted">{value}</Txt> : null}
      <Icon name="chev" sm color={c.muted} flip={rtl} />
    </Pressable>
  );
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }} testID="support">
      <BrandBar end={<TopIcons />} />
      <Screen edges={['left', 'right']} gap={space[4]}>
        <PageTitle sub={<Txt v="body" tone="muted">{A.supportP}</Txt>}>{A.tabSupport}</PageTitle>
        <View>
          {wa ? line(A.supportWaL, A.supportChat, () => Linking.openURL(wa).catch(() => {}), 'support-wa') : null}
          {line(A.supportFaq, '', () => router.push('/help'), 'support-faq')}
        </View>
      </Screen>
      <MainTabBar active="support" />
    </SafeAreaView>
  );
}

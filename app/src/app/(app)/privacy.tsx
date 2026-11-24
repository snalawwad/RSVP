// Privacy settings (opens from Account, Sama's Figma 24b "Privacy settings ›"): what we keep, who sees your guests'
// numbers, a copy of your data (asked from our team on WhatsApp, else Support), then Delete my account and the policy.
import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { Button, PageTitle, Screen, Txt } from '../../components';
import { ListHead, ListLine } from '../../components/ListLine';
import { links } from '../../lib/config';
import { useApp } from '../../providers/AppProvider';
import { space } from '../../theme/tokens';

export default function Privacy() {
  const { t, lang } = useApp();
  const A = t.a;
  const askCopy = () => {
    const wa = links.whatsapp(A.privCopyWa);
    if (wa) Linking.openURL(wa).catch(() => router.push('/support' as never));
    else router.push('/support' as never);
  };
  const block = (h: string, p: string, testID: string) => (
    <View style={{ gap: 4 }} testID={testID}>
      <ListHead>{h}</ListHead>
      <Txt v="body">{p}</Txt>
    </View>
  );
  return (
    <Screen gap={14} testID="privacy">
      <PageTitle testID="privacy-title">{A.privSettings}</PageTitle>
      {block(A.privKeepH, A.privKeepP, 'priv-keep')}
      {block(A.privNumH, A.privNumP, 'priv-numbers')}
      <View style={{ gap: space[3] }}>
        <ListHead>{A.privCopyH}</ListHead>
        <Button block kind="secondary" icon="whatsapp" label={A.privCopyB} onPress={askCopy} testID="priv-copy" />
      </View>
      <View style={{ marginTop: space[2] }}>
        <ListLine label={A.deleteMine} onPress={() => router.push('/delete-account')} testID="priv-delete" />
        <ListLine label={A.privacy} onPress={() => Linking.openURL(links.privacy(lang)).catch(() => {})} last testID="priv-policy" />
      </View>
    </Screen>
  );
}

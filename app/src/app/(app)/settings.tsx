import { router } from 'expo-router';
import { Linking, View } from 'react-native';
import { Button, Card, Screen, T } from '../../components/ui';
import { links } from '../../lib/config';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../providers/AppProvider';
import { space } from '../../theme/tokens';

export default function Settings() {
  const { t, f, lang, setLang, session } = useApp();
  return (
    <Screen>
      <Card>
        <T v="label" muted>{t.language}</T>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label={t.arabic} kind={lang === 'ar' ? 'primary' : 'outline'} onPress={() => setLang('ar')} style={{ flex: 1 }} />
          <Button label={t.english} kind={lang === 'en' ? 'primary' : 'outline'} onPress={() => setLang('en')} style={{ flex: 1 }} />
        </View>
        <T v="caption" muted>{t.languageRestart}</T>
      </Card>

      <Card>
        <T v="label" muted>{t.help}</T>
        <Button label={t.support} kind="outline" onPress={() => Linking.openURL(links.support(lang))} />
        <Button label={t.privacy} kind="outline" onPress={() => Linking.openURL(links.privacy(lang))} />
      </Card>

      <Card>
        <T v="caption" muted>{f(t.signedInAs, { email: session?.user.email ?? '' })}</T>
        <Button label={t.signOut} kind="outline" onPress={() => supabase.auth.signOut()} />
        <Button label={t.deleteAccount} kind="outline" onPress={() => router.push('/delete-account')} />
      </Card>
    </Screen>
  );
}

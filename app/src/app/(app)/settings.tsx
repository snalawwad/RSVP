// Account (Figma 24b Account 17:2187 and G10b 143:4048): name, phone or email, language (Arabic or English, right to
// left for Arabic), colours (Light / Dark / Auto), Help, WhatsApp us, Privacy policy, Terms, Log out, and Delete account
// (Apple 5.1.1(v): the account can be deleted inside the app; the delete-account function does the work).
// Opening Help, Privacy and Terms is fine: none of them sells anything.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandBar, Button, Field, Icon, PageTitle, Screen, Segmented, Sheet, Txt, useToast } from '../../components';
import { MainTabBar } from '../../components/MainTabBar';
import { signOut } from '../../lib/api';
import { myProfile, saveProfile } from '../../lib/api7';
import { links } from '../../lib/config';
import { haptics } from '../../lib/haptics';
import type { Profile } from '../../lib/types7';
import { useApp } from '../../providers/AppProvider';
import { mix, radius, size, space, type ThemePref } from '../../theme/tokens';

export default function Account() {
  const { t, lang, setLang, email, themePref, setThemePref, c } = useApp();
  const A = t.a;
  const toast = useToast();
  const [prof, setProf] = useState<Profile | null>(null);
  const [v7, setV7] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState(false);

  useEffect(() => {
    let off = false;
    myProfile().then((r) => { if (!off && r.data) { setProf(r.data); setV7(true); } });
    return () => { off = true; };
  }, []);

  const themes: { key: ThemePref; label: string }[] = [{ key: 'light', label: A.light }, { key: 'dark', label: A.dark }, { key: 'auto', label: A.auto }];
  const wa = links.whatsapp(lang === 'ar' ? 'مرحبا، عندي سؤال عن التطبيق' : 'Hi, I have a question about the app');

  async function saveName() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const r = await saveProfile(name.trim(), prof?.email && !email ? prof.email : null);
    setBusy(false);
    if (r.error || !r.data) { toast(t.host.cantSave('other')); return; }
    setProf(r.data); setEditing(false); toast(A.saved); haptics.success();
  }
  async function logOut() { setOut(true); haptics.tap(); await signOut(); }

  const langName = lang === 'ar' ? t.arabic : t.english;
  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
    <BrandBar />
    <Screen gap={space[5]} edges={['left', 'right']} testID="menu">
      <PageTitle testID="account-title">{A.account}</PageTitle>
      {/* Figma 24b: Name · Language · Help · Colours, then Log out */}
      <View>
        <Line label={A.name} value={prof?.name || A.notSet} onPress={v7 ? () => { setName(prof?.name || ''); setEditing(true); } : undefined} testID="acc-name" />
        <Line label={A.language} value={langName} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} testID="menu-lang" />
        <Line label={A.help} value={wa ? A.whatsappUs : A.helpSub} onPress={() => (wa ? Linking.openURL(wa).catch(() => {}) : router.push('/help'))} testID="menu-help" />
        <View testID="menu-theme" style={{ minHeight: 64, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
          <Txt v="body">{A.colours}</Txt>
          <Segmented<ThemePref> label={A.colours} value={themePref === 'cream' ? 'light' : themePref} onChange={(k) => { haptics.tap(); setThemePref(k); }} options={themes} testID="theme-switch" />
        </View>
        {Platform.OS !== 'web' ? <Txt v="small" tone="muted" style={{ marginTop: space[2] }}>{t.languageRestart}</Txt> : null}
      </View>

      <Button block kind="secondary" label={A.logOut} onPress={logOut} busy={out} testID="log-out" />

      {/* kept small under the design: Apple asks for a way to delete the account and for the privacy policy */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', columnGap: space[4], rowGap: space[1] }}>
        <Button small kind="quiet" label={A.helpSub} onPress={() => router.push('/help')} testID="acc-faq" />
        <Button small kind="quiet" label={A.privacy} onPress={() => Linking.openURL(links.privacy(lang)).catch(() => {})} testID="acc-privacy" />
        <Button small kind="quiet" label={A.termsLink} onPress={() => Linking.openURL(links.terms(lang)).catch(() => {})} testID="acc-terms" />
        <Button small kind="danger" label={A.deleteAccount} onPress={() => router.push('/delete-account')} testID="delete-account" />
      </View>

      <Sheet visible={editing} onClose={() => setEditing(false)} title={A.editName} closeLabel={t.close} testID="name-sheet"
        footer={<Button block kind="primary" label={A.save} onPress={saveName} busy={busy} disabled={!name.trim()} testID="name-save" />}>
        <Field label={A.yourName} value={name} onChangeText={setName} autoComplete="name" textContentType="name" onSubmitEditing={saveName} testID="name-field" />
      </Sheet>
    </Screen>
    <MainTabBar active="account" />
    </SafeAreaView>
  );
}

/** One account line (Figma: label at the start, value and chevron at the end). */
function Line({ label, value, onPress, ltr, testID }: { label: string; value?: string; onPress?: () => void; ltr?: boolean; testID?: string }) {
  const { c } = useApp();
  const body = (pressed: boolean) => (
    <View style={{ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: space[3], borderBottomWidth: 1, borderBottomColor: c.line, backgroundColor: pressed ? mix(c.bg, c.ink, 0.05) : 'transparent', borderRadius: pressed ? radius.s : 0 }}>
      <Txt v="body" style={{ flex: 1 }}>{label}</Txt>
      {value ? <Txt v="small" numberOfLines={1} script={ltr ? 'lat' : undefined} style={[{ flexShrink: 1 }, ltr ? { writingDirection: 'ltr' } : null]}>{value}</Txt> : null}
      {onPress ? <Icon name="chev" sm color={c.ink} /> : null}
    </View>
  );
  if (!onPress) return <View testID={testID} accessible accessibilityLabel={[label, value].filter(Boolean).join(': ')}>{body(false)}</View>;
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={[label, value].filter(Boolean).join(': ')} onPress={onPress} style={{ minHeight: size.target }}>{({ pressed }) => body(pressed)}</Pressable>;
}

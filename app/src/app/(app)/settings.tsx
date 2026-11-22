// Account (Figma 24b Account 17:2187 and G10b 143:4048): name, phone or email, language (Arabic or English, right to
// left for Arabic), colours (Light / Dark / Auto), Help, WhatsApp us, Privacy policy, Terms, Log out, and Delete account
// (Apple 5.1.1(v): the account can be deleted inside the app; the delete-account function does the work).
// Opening Help, Privacy and Terms is fine: none of them sells anything.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Button, Field, PageTitle, Screen, Sheet, Txt, useToast } from '../../components';
import { ListHead, ListLine } from '../../components/ListLine';
import { showPhone } from '../../lib/phone';
import { signOut } from '../../lib/api';
import { myProfile, saveProfile } from '../../lib/api7';
import { links } from '../../lib/config';
import { haptics } from '../../lib/haptics';
import type { Profile } from '../../lib/types7';
import { useApp } from '../../providers/AppProvider';
import { fonts, type ThemePref } from '../../theme/tokens';

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
  const { phone } = useApp();
  const shownPhone = prof?.phone || phone, shownEmail = prof?.email || email;
  const version = Constants.expoConfig?.version || '1.0';
  const tile = (k: ThemePref, label: string) => {
    const on = (themePref === 'cream' ? 'light' : themePref) === k;
    const dark = k === 'dark';
    return (
      <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={() => { haptics.tap(); setThemePref(k); }} testID={`theme-${k}`} style={{ flex: 1, gap: 8, alignItems: 'center' }}>
        <View style={{ alignSelf: 'stretch', height: 64, borderRadius: 12, overflow: 'hidden', borderWidth: on ? 2 : 1, borderColor: on ? c.plum : c.line, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: dark ? '#1C1A1B' : '#FFFFFF', alignItems: k === 'auto' ? 'flex-end' : 'center', justifyContent: 'center' }}>
            <Txt v="name" style={{ color: dark ? '#FFFFFF' : '#2A1B1D', fontFamily: fonts.display, fontSize: 22 }}>{k === 'auto' ? 'A' : 'Aa'}</Txt>
          </View>
          {k === 'auto' ? <View style={{ flex: 1, backgroundColor: '#1C1A1B', alignItems: 'flex-start', justifyContent: 'center' }}><Txt v="name" style={{ color: '#FFFFFF', fontFamily: fonts.display, fontSize: 22 }}>a</Txt></View> : null}
        </View>
        <Txt v="small" tone={on ? 'plum' : 'muted'}>{label}</Txt>
      </Pressable>
    );
  };
  const phoneShown = shownPhone ? showPhone(shownPhone).replace(/^(\d{4})(\d{4})$/, '+965 $1 $2') : '';
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
    <Screen gap={14} edges={['left', 'right', 'bottom']} testID="menu">
      <PageTitle testID="account-title">{A.account}</PageTitle>
      {/* Figma 24b (22 Nov evening): Your details · Preferences · Privacy · About, then Log out and the version.
          Notifications, Payments and Privacy settings in the frame are left out: the app sends no notifications yet,
          takes no payments (Apple), and has no privacy switches to show. */}
      <View>
        <ListHead>{A.secDetails}</ListHead>
        <ListLine label={A.name} value={prof?.name || A.notSet} onPress={v7 ? () => { setName(prof?.name || ''); setEditing(true); } : undefined} testID="acc-name" />
        <ListLine label={A.phoneNumber} value={phoneShown || A.notSet} ltrValue={!!phoneShown} last={!shownEmail} testID="acc-phone" />
        {shownEmail ? <ListLine label={A.email} value={shownEmail} ltrValue last testID="acc-email" /> : null}
      </View>
      <View>
        <ListHead>{A.secPrefs}</ListHead>
        <ListLine label={A.language} value={langName} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} testID="menu-lang" />
        <View testID="menu-theme" style={{ paddingVertical: 16, gap: 14 }}>
          <Txt v="body">{A.appearance}</Txt>
          <View style={{ flexDirection: 'row', gap: 10 }} accessibilityRole="radiogroup" accessibilityLabel={A.appearance}>
            {tile('light', A.light)}{tile('dark', A.dark)}{tile('auto', A.auto)}
          </View>
        </View>
        {Platform.OS !== 'web' ? <Txt v="small" tone="muted">{t.languageRestart}</Txt> : null}
      </View>
      <View>
        <ListHead>{A.secPrivacy}</ListHead>
        <ListLine label={A.deleteMine} onPress={() => router.push('/delete-account')} last testID="delete-account" />
      </View>
      <View>
        <ListHead>{A.secAbout}</ListHead>
        <ListLine label={A.aboutSina} onPress={() => Linking.openURL(links.about(lang)).catch(() => {})} testID="acc-about" />
        <ListLine label={A.termsOfUse} onPress={() => Linking.openURL(links.terms(lang)).catch(() => {})} testID="acc-terms" />
        <ListLine label={A.privacy} onPress={() => Linking.openURL(links.privacy(lang)).catch(() => {})} last testID="acc-privacy" />
      </View>
      <View style={{ gap: 14 }}>
        <Button block kind="secondary" label={A.logOut} onPress={logOut} busy={out} testID="log-out" />
        <Txt v="small" tone="muted" center style={{ fontSize: 13.5 }} testID="acc-version">{A.versionLine(version)}</Txt>
      </View>

      <Sheet visible={editing} onClose={() => setEditing(false)} title={A.editName} closeLabel={t.close} testID="name-sheet"
        footer={<Button block kind="primary" label={A.save} onPress={saveName} busy={busy} disabled={!name.trim()} testID="name-save" />}>
        <Field label={A.yourName} value={name} onChangeText={setName} autoComplete="name" textContentType="name" onSubmitEditing={saveName} testID="name-field" />
      </Sheet>
    </Screen>
    </SafeAreaView>
  );
}

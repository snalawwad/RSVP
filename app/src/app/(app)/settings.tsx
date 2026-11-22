// Account (Figma 24b Account 17:2187 and G10b 143:4048): name, phone or email, language (Arabic or English, right to
// left for Arabic), colours (Light / Dark / Auto), Help, WhatsApp us, Privacy policy, Terms, Log out, and Delete account
// (Apple 5.1.1(v): the account can be deleted inside the app; the delete-account function does the work).
// Opening Help, Privacy and Terms is fine: none of them sells anything.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Constants from 'expo-constants';
import { Button, Field, Icon, PageTitle, Screen, Sheet, Txt, useToast } from '../../components';
import { showPhone } from '../../lib/phone';
import { signOut } from '../../lib/api';
import { myProfile, saveProfile } from '../../lib/api7';
import { links } from '../../lib/config';
import { haptics } from '../../lib/haptics';
import type { Profile } from '../../lib/types7';
import { useApp } from '../../providers/AppProvider';
import { fonts, mix, radius, size, space, type ThemePref } from '../../theme/tokens';

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
      <Pressable key={k} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={() => { haptics.tap(); setThemePref(k); }} testID={`theme-${k}`} style={{ flex: 1, gap: 6, alignItems: 'center' }}>
        <View style={{ alignSelf: 'stretch', height: 64, borderRadius: radius.m, overflow: 'hidden', borderWidth: on ? 2 : 1, borderColor: on ? c.plum : c.line, flexDirection: 'row' }}>
          <View style={{ flex: 1, backgroundColor: dark ? '#1C1A1B' : '#FFFFFF', alignItems: k === 'auto' ? 'flex-end' : 'center', justifyContent: 'center' }}>
            <Txt v="name" style={{ color: dark ? '#FFFFFF' : '#2A1B1D', fontFamily: fonts.display, fontSize: 20 }}>{k === 'auto' ? 'A' : 'Aa'}</Txt>
          </View>
          {k === 'auto' ? <View style={{ flex: 1, backgroundColor: '#1C1A1B', alignItems: 'flex-start', justifyContent: 'center' }}><Txt v="name" style={{ color: '#FFFFFF', fontFamily: fonts.display, fontSize: 20 }}>a</Txt></View> : null}
        </View>
        <Txt v="small" tone={on ? 'plum' : 'muted'}>{label}</Txt>
      </Pressable>
    );
  };
  const head = (s: string) => <Txt v="label" tone="muted" style={{ marginTop: space[4], marginBottom: 2 }}>{s}</Txt>;
  return (
    <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: c.bg }}>
    <Screen gap={space[2]} edges={['left', 'right', 'bottom']} testID="menu">
      <PageTitle testID="account-title">{A.account}</PageTitle>
      {/* Figma 24b (22 Nov evening): Your details · Preferences · Privacy · About, then Log out and the version */}
      {head(A.secDetails)}
      <View>
        <Line label={A.name} value={prof?.name || A.notSet} onPress={v7 ? () => { setName(prof?.name || ''); setEditing(true); } : undefined} testID="acc-name" />
        {shownPhone ? <Line label={A.phoneNumber} value={showPhone(shownPhone).replace(/^(\d{4})(\d{4})$/, '+965 $1 $2')} ltr testID="acc-phone" /> : null}
        {shownEmail ? <Line label={A.email} value={shownEmail} ltr testID="acc-email" /> : null}
      </View>
      {head(A.secPrefs)}
      <View>
        <Line label={A.language} value={langName} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} testID="menu-lang" />
        <View testID="menu-theme" style={{ paddingVertical: space[3], gap: space[3], borderBottomWidth: 1, borderBottomColor: c.line }}>
          <Txt v="body">{A.appearance}</Txt>
          <View style={{ flexDirection: 'row', gap: space[3] }} accessibilityRole="radiogroup" accessibilityLabel={A.appearance}>
            {tile('light', A.light)}{tile('dark', A.dark)}{tile('auto', A.auto)}
          </View>
        </View>
        {Platform.OS !== 'web' ? <Txt v="small" tone="muted" style={{ marginTop: space[2] }}>{t.languageRestart}</Txt> : null}
      </View>
      {head(A.secPrivacy)}
      <View>
        <Line label={A.deleteMine} onPress={() => router.push('/delete-account')} testID="delete-account" />
      </View>
      {head(A.secAbout)}
      <View>
        <Line label={A.aboutSina} onPress={() => Linking.openURL(links.about(lang)).catch(() => {})} testID="acc-about" />
        <Line label={A.termsOfUse} onPress={() => Linking.openURL(links.terms(lang)).catch(() => {})} testID="acc-terms" />
        <Line label={A.privacy} onPress={() => Linking.openURL(links.privacy(lang)).catch(() => {})} testID="acc-privacy" />
      </View>
      <View style={{ marginTop: space[5], gap: space[3] }}>
        <Button block kind="secondary" label={A.logOut} onPress={logOut} busy={out} testID="log-out" />
        <Txt v="small" tone="muted" center testID="acc-version">{A.versionLine(version)}</Txt>
      </View>

      <Sheet visible={editing} onClose={() => setEditing(false)} title={A.editName} closeLabel={t.close} testID="name-sheet"
        footer={<Button block kind="primary" label={A.save} onPress={saveName} busy={busy} disabled={!name.trim()} testID="name-save" />}>
        <Field label={A.yourName} value={name} onChangeText={setName} autoComplete="name" textContentType="name" onSubmitEditing={saveName} testID="name-field" />
      </Sheet>
    </Screen>
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

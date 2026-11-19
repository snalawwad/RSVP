// Account (Figma 24b Account 17:2187 and G10b 143:4048): name, phone or email, language (Arabic or English, right to
// left for Arabic), colours (Light / Dark / Auto), Help, WhatsApp us, Privacy policy, Terms, Log out, and Delete account
// (Apple 5.1.1(v): the account can be deleted inside the app; the delete-account function does the work).
// Opening Help, Privacy and Terms is fine: none of them sells anything.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, View } from 'react-native';
import { Button, Field, Icon, Screen, Segmented, Sheet, Txt, useToast } from '../../components';
import { signOut } from '../../lib/api';
import { myProfile, saveProfile } from '../../lib/api7';
import { links } from '../../lib/config';
import { haptics } from '../../lib/haptics';
import { showPhone } from '../../lib/phone';
import type { Profile } from '../../lib/types7';
import type { Lang } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { mix, radius, size, space, type ThemePref } from '../../theme/tokens';

export default function Account() {
  const { t, lang, setLang, email, phone, themePref, setThemePref, c } = useApp();
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

  const langs: { key: Lang; label: string }[] = [{ key: 'ar', label: t.arabic }, { key: 'en', label: t.english }];
  const themes: { key: ThemePref; label: string }[] = [{ key: 'light', label: A.light }, { key: 'dark', label: A.dark }, { key: 'auto', label: A.auto }];
  const wa = links.whatsapp(lang === 'ar' ? 'مرحبا، عندي سؤال عن التطبيق' : 'Hi, I have a question about the app');
  const shownPhone = prof?.phone || phone;
  const shownEmail = prof?.email || email;

  async function saveName() {
    if (!name.trim() || busy) return;
    setBusy(true);
    const r = await saveProfile(name.trim(), prof?.email && !email ? prof.email : null);
    setBusy(false);
    if (r.error || !r.data) { toast(t.host.cantSave('other')); return; }
    setProf(r.data); setEditing(false); toast(A.saved); haptics.success();
  }
  async function logOut() { setOut(true); haptics.tap(); await signOut(); }

  return (
    <Screen gap={space[5]} testID="menu">
      <View>
        {v7 ? <Line label={A.name} value={prof?.name || A.notSet} onPress={() => { setName(prof?.name || ''); setEditing(true); }} testID="acc-name" /> : null}
        {shownPhone ? <Line label={A.phone} value={showPhone(shownPhone).replace(/^(\d{4})(\d{4})$/, '+965 $1 $2')} ltr testID="acc-phone" /> : null}
        {shownEmail ? <Line label={A.email} value={shownEmail} ltr testID="acc-email" /> : null}
        <View testID="menu-lang" style={{ minHeight: 64, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: c.line, gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
            <Txt v="body">{A.language}</Txt>
            <Segmented<Lang> label={A.language} value={lang} onChange={(l) => { if (l !== lang) setLang(l); }} options={langs} testID="lang-switch" />
          </View>
          {Platform.OS !== 'web' ? <Txt v="small">{t.languageRestart}</Txt> : null}
        </View>
        <View testID="menu-theme" style={{ minHeight: 64, paddingVertical: space[3], borderBottomWidth: 1, borderBottomColor: c.line, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
          <Txt v="body">{A.colours}</Txt>
          <Segmented<ThemePref> label={A.colours} value={themePref === 'cream' ? 'light' : themePref} onChange={(k) => { haptics.tap(); setThemePref(k); }} options={themes} testID="theme-switch" />
        </View>
        <Line label={A.help} value={A.helpSub} onPress={() => router.push('/help')} testID="menu-help" />
        {wa ? <Line label={A.whatsappUs} onPress={() => Linking.openURL(wa).catch(() => {})} testID="acc-wa" /> : null}
        <Line label={A.privacy} onPress={() => Linking.openURL(links.privacy(lang)).catch(() => {})} testID="acc-privacy" />
        <Line label={A.termsLink} onPress={() => Linking.openURL(links.terms(lang)).catch(() => {})} testID="acc-terms" />
      </View>

      <View style={{ gap: space[2] }}>
        <Button block kind="secondary" label={A.logOut} onPress={logOut} busy={out} testID="log-out" />
        <Button block kind="danger" label={A.deleteAccount} onPress={() => router.push('/delete-account')} testID="delete-account" />
      </View>

      <Sheet visible={editing} onClose={() => setEditing(false)} title={A.editName} closeLabel={t.close} testID="name-sheet"
        footer={<Button block kind="primary" label={A.save} onPress={saveName} busy={busy} disabled={!name.trim()} testID="name-save" />}>
        <Field label={A.yourName} value={name} onChangeText={setName} autoComplete="name" textContentType="name" onSubmitEditing={saveName} testID="name-field" />
      </Sheet>
    </Screen>
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

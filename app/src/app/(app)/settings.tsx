// The Menu (core.js mountMenu): Language · Colours · Help, then Log out set apart at the bottom.
// Nothing else goes in the Menu (no event lists, no tabs). Delete account sits under Log out (Apple and Google
// ask for it inside the app).
import { router } from 'expo-router';
import { useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Button, Icon, Row, RowList, Screen, Segmented, Txt } from '../../components';
import { signOut } from '../../lib/api';
import { haptics } from '../../lib/haptics';
import type { Lang } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { mix, space, swatch, type ThemePref } from '../../theme/tokens';

export default function Settings() {
  const { t, f, lang, setLang, email, themePref, setThemePref, c, rtl } = useApp();
  // pull a text button back to the gutter so its words line up with the line above (react-native-web doesn't flip start/end margins)
  const pull = (n: number) => (Platform.OS === 'web' ? (rtl ? { marginRight: -n } : { marginLeft: -n }) : { marginStart: -n });
  const [out, setOut] = useState(false);
  // Arabic first, English second, in reading order (core.js labelMenu)
  const langs: { key: Lang; label: string }[] = [{ key: 'ar', label: t.arabic }, { key: 'en', label: t.english }];
  const themes: { key: ThemePref; label: string; swatch?: string }[] = [
    ...(['cream', 'light', 'dark'] as const).map((k) => ({ key: k as ThemePref, label: t.menu.theme[k], swatch: swatch[k] })),
    { key: 'auto' as ThemePref, label: t.menu.theme.auto },
  ];

  async function logOut() {
    setOut(true);
    haptics.tap();
    await signOut();   // the root layout shows the login again
  }

  return (
    <Screen gap={space[4]} testID="menu">
      <RowList>
        <View style={{ minHeight: 64, paddingHorizontal: space[4], paddingVertical: space[3], gap: space[2] }} testID="menu-lang">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space[3], flexWrap: 'wrap' }}>
            <Txt v="name">{t.menu.language}</Txt>
            <Segmented<Lang> label={t.menu.language} value={lang} onChange={(l) => { if (l !== lang) setLang(l); }} options={langs} testID="lang-switch" />
          </View>
          {Platform.OS !== 'web' ? <Txt v="small">{t.languageRestart}</Txt> : null}
        </View>
        {/* Colours: four choices don't fit one segmented row in Arabic, so they're a short radio list with the web swatches */}
        <View testID="menu-theme" style={{ paddingTop: space[3] }}>
          <Txt v="name" style={{ paddingHorizontal: space[4] }}>{t.menu.colours}</Txt>
          <View testID="theme-switch" accessibilityRole="radiogroup" accessibilityLabel={t.menu.colours}>
            {themes.map((o) => {
              const on = o.key === themePref;
              return (
                <Pressable key={o.key} testID={`theme-${o.key}`} accessibilityRole="radio" accessibilityLabel={o.label} accessibilityState={{ selected: on, checked: on }}
                  onPress={() => { haptics.tap(); setThemePref(o.key); }}
                  style={({ pressed }) => ({ minHeight: 52, paddingHorizontal: space[4], flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: pressed ? mix(c.card, c.ink, 0.08) : 'transparent' })}>
                  {/* the phone's choice: half cream, half dark */}
                  <View style={{ width: 22, height: 22, borderRadius: 11, overflow: 'hidden', flexDirection: 'row', backgroundColor: o.swatch ?? swatch.cream, borderWidth: 1, borderColor: 'rgba(128,128,128,0.45)' }}>
                    {o.swatch ? null : <View style={{ marginStart: 10, flex: 1, backgroundColor: swatch.dark }} />}
                  </View>
                  <Txt v="body" tone={on ? 'ink' : 'muted'} style={{ flex: 1 }}>{o.label}</Txt>
                  {on ? <Icon name="check" color={c.ink} /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
        <Row title={t.menu.help} chevron onPress={() => router.push('/help')} testID="menu-help" />
      </RowList>

      {/* Log out, set apart (web .menu-out) */}
      <View style={{ marginTop: space[6], paddingTop: space[3], borderTopWidth: 1, borderTopColor: c.line, gap: space[1] }}>
        {email ? <Txt v="small">{f(t.signedInAs, { email })}</Txt> : null}
        <Button label={t.menu.logOut} kind="danger" onPress={logOut} busy={out} testID="log-out" style={pull(space[5])} />
        <Button label={t.deleteAccount} kind="quiet" small onPress={() => router.push('/delete-account')} testID="delete-account" style={[pull(space[4]), { marginTop: space[2] }]} />
      </View>
    </Screen>
  );
}

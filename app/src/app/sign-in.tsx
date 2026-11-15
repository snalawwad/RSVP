// Log in with a 6-digit code sent by email (the web login card, core.js requireLogin): the name Sina / سنة in
// type, the envelope, a small kicker, the big heading, one field and one filled button, in the arch-topped card.
// Step 1: email → Send my code. Step 2: the code → Log in, or use a different email.
// The first login creates the account, like the web; what the person sees is decided by event_members.
import { useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, View, type TextInput } from 'react-native';
import { ArchMark, Button, Field, Icon, PressScale, Screen, Txt } from '../components';
import { isConfigured } from '../lib/config';
import { asciiDigits } from '../lib/names';
import { supabase } from '../lib/supabase';
import { iso } from '../lib/words';
import { useApp } from '../providers/AppProvider';
import { fonts, radius, shadow, size, space } from '../theme/tokens';

export default function SignIn() {
  const { t, lang, setLang, c } = useApp();
  const L = t.login;
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef<ComponentRef<typeof TextInput>>(null);
  const ar = lang === 'ar';

  async function sendCode() {
    if (busy) return;
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError(L.bad);
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.signInWithOtp({ email: e });
    setBusy(false);
    if (err) return setError(L.fail);
    setEmail(e); setCode(''); setStep('code');
    setTimeout(() => codeRef.current?.focus(), 50);
  }

  async function verify() {
    if (busy) return;
    const token = asciiDigits(code).replace(/\D/g, '');
    if (token.length < 6) return setError(L.wrong);
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    setBusy(false);
    if (err) setError(L.wrong);
    // On success the root layout switches to the app by itself.
  }

  const heading = { fontSize: 34, lineHeight: ar ? 54 : 40 };
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen edges={['top', 'left', 'right', 'bottom']} contentStyle={{ flexGrow: 1, paddingTop: 0 }} gap={0} testID="sign-in">
        {/* top bar: the arch mark at the start, the other language at the end */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 64, marginHorizontal: -space[4], paddingHorizontal: space[4], borderBottomWidth: 1, borderBottomColor: c.line }}>
          <View accessible accessibilityLabel={t.appName}><ArchMark size={26} /></View>
          <PressScale kind="chip" testID="lang-toggle" accessibilityRole="button" accessibilityLabel={`${t.menu.language}: ${t.menu.other}`} onPress={() => setLang(ar ? 'en' : 'ar')} hitSlop={4}
            style={{ minHeight: size.target, paddingHorizontal: space[4], borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, justifyContent: 'center' }}>
            <Txt v="label" tone="ink">{t.menu.other}</Txt>
          </PressScale>
        </View>

        <View style={{ flex: 1, justifyContent: 'center', paddingVertical: space[6] }}>
          <ArchCard>
            <Txt v="title" tone="plum" center accessibilityRole="text" testID="brandmark"
              style={{ fontFamily: ar ? fonts.arDisplayBold : fonts.display, fontSize: 22, lineHeight: ar ? 36 : 28 }}>{t.appName}</Txt>
            <View style={{ alignItems: 'center', marginBottom: space[1] }}><Icon name="env" size={40} color={c.plum} /></View>
            {!isConfigured ? (
              <>
                <Txt v="title" center style={heading}>{L.cfgH}</Txt>
                <Txt v="body" tone="muted" center>{L.cfgP}</Txt>
              </>
            ) : step === 'email' ? (
              <>
                <Txt v="label" tone="muted" center>{L.kick}</Txt>
                <Txt v="title" center style={heading}>{L.h}</Txt>
                <Txt v="body" tone="muted" center>{L.sub}</Txt>
                <View style={{ gap: space[3], marginTop: space[4] }}>
                  <Field label={L.email} value={email} onChangeText={(v) => { setEmail(v); if (error) setError(''); }} placeholder={t.emailPlaceholder} ltr
                    autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
                    inputMode="email" onSubmitEditing={sendCode} returnKeyType="send" error={error || undefined} testID="email" />
                  <Button label={L.send} kind="primary" block onPress={sendCode} busy={busy} testID="send-code" />
                </View>
              </>
            ) : (
              <>
                <Txt v="label" tone="muted" center>{L.kick2}</Txt>
                <Txt v="title" center style={heading}>{L.h2}</Txt>
                <Txt v="body" tone="muted" center testID="sent-to">{L.sent(iso(email))}</Txt>
                <View style={{ gap: space[3], marginTop: space[4] }}>
                  <Field ref={codeRef} label={L.code} value={code} onChangeText={(v) => { setCode(v); if (error) setError(''); }} ltr
                    keyboardType="number-pad" inputMode="numeric" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8}
                    onSubmitEditing={verify} returnKeyType="done" error={error || undefined} testID="code" />
                  <Button label={L.verify} kind="primary" block onPress={verify} busy={busy} testID="verify" />
                  <Button label={L.back} kind="quiet" onPress={() => { setStep('email'); setCode(''); setError(''); }} style={{ alignSelf: 'center' }} testID="use-other-email" />
                </View>
              </>
            )}
          </ArchCard>
        </View>
      </Screen>
    </KeyboardAvoidingView>
  );
}

/** The web login box: an arch-topped card with a hairline inside it. */
function ArchCard({ children }: { children: ReactNode }) {
  const { c, theme } = useApp();
  const [wd, setWd] = useState(358);
  const r = Math.min(220, wd / 2);
  return (
    <View onLayout={(e) => setWd(e.nativeEvent.layout.width)}
      style={[{ width: '100%', maxWidth: 400, alignSelf: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.line, borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: 20, borderBottomRightRadius: 20, paddingTop: 58, paddingHorizontal: 26, paddingBottom: 30, gap: space[2] }, shadow(theme, true)]}>
      <View pointerEvents="none" style={{ position: 'absolute', top: 8, left: 8, right: 8, bottom: 8, borderWidth: 1, borderColor: c.line, borderTopLeftRadius: r - 8, borderTopRightRadius: r - 8, borderBottomLeftRadius: 13, borderBottomRightRadius: 13 }} />
      {children}
    </View>
  );
}

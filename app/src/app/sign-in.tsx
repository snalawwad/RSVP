// S1 log in by email (no password) → S2 type the 6-digit code from the email.
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, View } from 'react-native';
import { Button, Field, Screen, T } from '../components/ui';
import { isConfigured } from '../lib/config';
import { supabase } from '../lib/supabase';
import { useApp } from '../providers/AppProvider';
import { space } from '../theme/tokens';

export default function SignIn() {
  const { t, f, lang, setLang, c } = useApp();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function sendCode() {
    const e = email.trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(e)) return setError(t.invalidEmail);
    setBusy(true); setError('');
    // Same as the web app: first login creates the account. What they see is decided by event_members.
    const { error: err } = await supabase.auth.signInWithOtp({ email: e });
    setBusy(false);
    if (err) return setError(t.couldNotSend);
    setEmail(e); setStep('code');
  }

  async function verify() {
    setBusy(true); setError('');
    const { error: err } = await supabase.auth.verifyOtp({ email, token: code.replace(/\D/g, ''), type: 'email' });
    setBusy(false);
    if (err) setError(t.wrongCode);
    // On success the root layout switches to the app automatically.
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen>
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingTop: space[10] }}>
          <Pressable accessibilityRole="button" onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} hitSlop={12}>
            <T v="label" color={c.primary}>{lang === 'ar' ? t.english : t.arabic}</T>
          </Pressable>
        </View>
        <T v="heading1" accessibilityRole="header" style={{ marginTop: space[8] }}>
          {step === 'email' ? t.signInTitle : t.checkEmailTitle}
        </T>
        <T muted>{step === 'email' ? t.signInSub : f(t.checkEmailSub, { email })}</T>

        {!isConfigured && <T color={c.no}>Supabase settings are missing in app/.env</T>}

        {step === 'email' ? (
          <>
            <Field label={t.email} value={email} onChangeText={setEmail} placeholder={t.emailPlaceholder}
              autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
              onSubmitEditing={sendCode} returnKeyType="send" />
            {!!error && <T color={c.no}>{error}</T>}
            <Button label={t.sendCode} onPress={sendCode} loading={busy} />
          </>
        ) : (
          <>
            <Field label={t.code} value={code} onChangeText={setCode} keyboardType="number-pad"
              autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={8} onSubmitEditing={verify} />
            {!!error && <T color={c.no}>{error}</T>}
            <Button label={t.logIn} onPress={verify} loading={busy} disabled={code.replace(/\D/g, '').length < 6} />
            <Button label={t.useDifferentEmail} kind="outline" onPress={() => { setStep('email'); setCode(''); setError(''); }} />
          </>
        )}
      </Screen>
    </KeyboardAvoidingView>
  );
}

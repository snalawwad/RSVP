// Getting in (Sama's Figma, Host 1 "Get started"):
//   01 Welcome (50:13920) → 02 Create account (54:5565) or 02b Log in (54:5599) → 03 Enter the code (52:3006),
//   with its states 03a empty (73:3535), 03b wrong code (73:3589) and 03c expired (73:3650).
// A phone number and a WhatsApp code when EXPO_PUBLIC_LOGIN_PHONE=true (the WhatsApp code hook is on); until then an
// email and an email code. Supabase signInWithOtp / verifyOtp. The first login makes the account.
// Create account keeps the name (and email) and saves it with save_profile_v2 once logged in (see (app)/index).
// The app never offers to create an event or to pay (Apple): getting in only.
import { useEffect, useRef, useState } from 'react';
import { BackHandler, KeyboardAvoidingView, Linking, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { BrandBar, Button, Field, Icon, PageTitle, PressScale, Txt } from '../components';
import { CodeBoxes, type CodeBoxesRef } from '../components/CodeBoxes';
import { WelcomeArt } from '../components/WelcomeArt';
import { config, isConfigured, links } from '../lib/config';
import { normPhone, showPhone } from '../lib/phone';
import { KEYS, kv } from '../lib/storage';
import { supabase } from '../lib/supabase';
import { useApp } from '../providers/AppProvider';
import { fonts, radius, size, space } from '../theme/tokens';

type Step = 'welcome' | 'create' | 'login' | 'code';
type CodeErr = '' | 'wrong' | 'expired';
const RESEND_S = 30;
const OTP_TTL_MS = 60 * 60e3;

export default function SignIn() {
  const { t, lang, setLang, c, rtl } = useApp();
  const A = t.a;
  const phoneMode = config.loginPhone;
  const [step, setStep] = useState<Step>('welcome');
  const [from, setFrom] = useState<'create' | 'login'>('login');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [errs, setErrs] = useState<{ name?: string; phone?: string; email?: string; send?: string }>({});
  const [code, setCode] = useState('');
  const [codeErr, setCodeErr] = useState<CodeErr>('');
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  const [now, setNow] = useState(0);
  const [resentNote, setResentNote] = useState(false);
  const boxes = useRef<CodeBoxesRef>(null);
  const ar = lang === 'ar';

  // the "Resend code in 0:24" countdown
  useEffect(() => {
    if (step !== 'code') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [step]);
  const wait = Math.max(0, RESEND_S - Math.floor((now - sentAt) / 1000));

  const target = () => (phoneMode ? normPhone(phone) : email.trim().toLowerCase());
  function check(): boolean {
    const e: typeof errs = {};
    if (step === 'create' && !name.trim()) e.name = A.needName;
    if (phoneMode) {
      const p = normPhone(phone);
      if (!/^965\d{8}$/.test(p) && !/^(?!965)\d{9,15}$/.test(p)) e.phone = A.badPhone;
      if (step === 'create' && email.trim() && !/^\S+@\S+\.\S+$/.test(email.trim())) e.email = A.badEmail;
    } else if (!/^\S+@\S+\.\S+$/.test(email.trim())) e.email = A.badEmail;
    setErrs(e);
    return !Object.keys(e).length;
  }

  async function send(again = false) {
    if (busy) return;
    if (!again && !check()) return;
    setBusy(true); setErrs({});
    const to = target();
    const { error } = phoneMode ? await supabase.auth.signInWithOtp({ phone: '+' + to }) : await supabase.auth.signInWithOtp({ email: to });
    setBusy(false);
    if (error) { if (again) setCodeErr(''); setErrs({ send: A.sendFail }); return; }
    if (!again) {
      setFrom(step === 'create' ? 'create' : 'login');
      // Create account: the name (and email) wait here until the login works, then go to the profile
      if (step === 'create') kv.setJSON(KEYS.pendingProfile, { name: name.trim(), email: phoneMode ? email.trim().toLowerCase() || null : to });
      else kv.remove(KEYS.pendingProfile);
    }
    setSentAt(Date.now()); setNow(Date.now()); setCode(''); setCodeErr(''); setResentNote(again); setStep('code');
    setTimeout(() => boxes.current?.focus(), 80);
  }

  async function verify(token = code) {
    if (busy || token.length < 6) return;
    setBusy(true); setCodeErr('');
    const to = target();
    const { error } = phoneMode
      ? await supabase.auth.verifyOtp({ phone: '+' + to, token, type: 'sms' })
      : await supabase.auth.verifyOtp({ email: to, token, type: 'email' });
    setBusy(false);
    if (!error) return;   // the root layout opens the app by itself
    const msg = String(error.message || '');
    const expired = Date.now() - sentAt > OTP_TTL_MS || (/expired/i.test(msg) && !/invalid/i.test(msg));
    setCodeErr(expired ? 'expired' : 'wrong');
  }

  const toLang = (
    <PressScale kind="chip" testID="lang-toggle" accessibilityRole="button" accessibilityLabel={`${t.menu.language}: ${t.menu.other}`} onPress={() => setLang(ar ? 'en' : 'ar')} hitSlop={4}
      style={{ minHeight: size.target, paddingHorizontal: space[4], borderRadius: radius.pill, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, justifyContent: 'center' }}>
      <Txt v="label" tone="ink">{t.menu.other}</Txt>
    </PressScale>
  );
  const back = (to: Step) => () => { setErrs({}); setCodeErr(''); setStep(to); };
  useEffect(() => {
    if (step === 'welcome') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(step === 'code' ? from : 'welcome')(); return true; });
    return () => sub.remove();
  }, [step, from]);

  if (!isConfigured) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.bg, padding: space[4], justifyContent: 'center' }}>
        <PageTitle sub={t.login.cfgP}>{t.login.cfgH}</PageTitle>
      </SafeAreaView>
    );
  }

  // ---------- 01 Welcome ----------
  if (step === 'welcome') {
    return (
      <SafeAreaView testID="sign-in" style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right', 'bottom']}>
        <BrandBar end={toLang} />
        <ScrollView contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[5], paddingTop: space[6], paddingBottom: space[4], gap: space[4] }}>
          <View testID="welcome" accessible accessibilityRole="header">
            <Txt v="title" style={{ fontSize: ar ? 34 : 41, lineHeight: ar ? 56 : 42, letterSpacing: ar ? 0 : -1.2, fontFamily: ar ? fonts.arDisplayBold : fonts.display }}>{A.welcomeH1}</Txt>
            <Txt v="title" style={{ marginTop: ar ? space[2] : space[6], fontSize: ar ? 34 : 41, lineHeight: ar ? 56 : 42, letterSpacing: ar ? 0 : -1.2, fontFamily: ar ? fonts.arDisplayBold : fonts.display }}>{A.welcomeH2}</Txt>
          </View>
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 220, transform: rtl ? [{ scaleX: -1 }] : undefined }}>
            <WelcomeArt width={320} />
          </View>
          <Txt v="body" tone="muted" center>{A.welcomeP}</Txt>
        </ScrollView>
        <View style={{ paddingHorizontal: space[5], paddingTop: space[3], paddingBottom: space[4], gap: 10 }}>
          <Button block kind="primary" label={A.logIn} onPress={() => setStep('login')} testID="go-login" />
          <Button block kind="secondary" label={A.createAccount} onPress={() => setStep('create')} testID="go-create" />
        </View>
      </SafeAreaView>
    );
  }

  // ---------- 02 Create account · 02b Log in · 03 Enter the code ----------
  const head = step === 'create' ? A.createH : step === 'login' ? A.backH : A.codeH;
  const sub = step === 'create' ? (phoneMode ? A.createPPhone : A.createPEmail)
    : step === 'login' ? (phoneMode ? A.backPPhone : A.backPEmail)
    : phoneMode ? A.sentPhone(showPhone(target()).replace(/^(\d{4})(\d{4})$/, '+965 $1 $2')) : A.sentEmail(target());

  const footer = step === 'code' ? (
    <Button block kind="primary" label={A.continue} onPress={() => verify()} busy={busy} disabled={code.length < 6 || !!codeErr} testID="verify" />
  ) : (
    <>
      <Button block kind="primary" icon={phoneMode ? 'whatsapp' : 'env'} label={A.sendCode} onPress={() => send()} busy={busy} testID="send-code" />
      <Button block kind="quiet" label={step === 'create' ? A.haveAccount : A.newHere} onPress={back(step === 'create' ? 'login' : 'create')} testID={step === 'create' ? 'to-login' : 'to-create'} />
      {step === 'create' ? (
        <PressScale kind="chip" accessibilityRole="link" accessibilityLabel={A.terms} onPress={() => Linking.openURL(links.terms(lang)).catch(() => {})} testID="terms"
          style={{ minHeight: size.target, justifyContent: 'center', alignSelf: 'center', paddingHorizontal: space[2] }}>
          <Txt v="small" center style={{ fontSize: 12.5, textDecorationLine: 'underline' }}>{A.terms}</Txt>
        </PressScale>
      ) : null}
    </>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView testID="sign-in" style={{ flex: 1, backgroundColor: c.bg }} edges={['top', 'left', 'right', 'bottom']}>
        <BrandBar end={toLang} />
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, paddingHorizontal: space[4], paddingTop: space[6], paddingBottom: space[6], gap: 18 }}>
          {/* a way back on every step: Log in / Create account → Welcome, Enter the code → the step before */}
          <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={t.back} hitSlop={4} testID="step-back"
            onPress={back(step === 'code' ? from : 'welcome')}
            style={{ width: size.target, height: size.target, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center', marginTop: -space[3] }}>
            <Icon name="chev" color={c.plum} flip={!rtl} />
          </PressScale>
          <PageTitle testID={`step-${step}`} sub={<Txt v="body" tone="muted" testID="sent-to">{sub}</Txt>}>{head}</PageTitle>

          {step === 'create' ? (
            <Field label={A.yourName} value={name} onChangeText={(v) => { setName(v); setErrs((e) => ({ ...e, name: undefined })); }} autoComplete="name" textContentType="name"
              returnKeyType="next" error={errs.name} testID="name" />
          ) : null}
          {step !== 'code' && phoneMode ? (
            <Field label={A.phone} value={phone} onChangeText={(v) => { setPhone(v); setErrs((e) => ({ ...e, phone: undefined })); }} ltr placeholder="9876 5432"
              keyboardType="phone-pad" inputMode="tel" autoComplete="tel" textContentType="telephoneNumber" error={errs.phone} testID="phone"
              onSubmitEditing={step === 'login' ? () => send() : undefined} />
          ) : null}
          {step !== 'code' && (!phoneMode || step === 'create') ? (
            <Field label={phoneMode ? A.emailOpt : A.email} value={email} onChangeText={(v) => { setEmail(v); setErrs((e) => ({ ...e, email: undefined })); }} ltr
              placeholder={t.emailPlaceholder} autoCapitalize="none" autoCorrect={false} autoComplete="email" keyboardType="email-address" textContentType="emailAddress"
              inputMode="email" error={errs.email} testID="email" onSubmitEditing={() => send()} returnKeyType="send" />
          ) : null}
          {errs.send ? <Txt v="small" tone="no" accessibilityRole="alert" testID="send-err">{errs.send}</Txt> : null}

          {step === 'code' ? (
            <View style={{ gap: space[3] }}>
              <CodeBoxes ref={boxes} value={code} label={t.login.code} bad={codeErr === 'wrong'} testID="code"
                onChange={(v) => { setCode(v); if (codeErr === 'wrong') setCodeErr(''); if (v.length === 6 && !busy) verify(v); }} onDone={() => undefined} />
              {codeErr === 'wrong' ? (
                <View style={{ gap: space[1] }}>
                  <Txt v="small" tone="no" accessibilityRole="alert" testID="code-wrong">{A.wrong}</Txt>
                  {wait ? null : <Button small kind="quiet" label={A.resend} onPress={() => send(true)} testID="resend" style={{ marginStart: -space[4] }} />}
                </View>
              ) : codeErr === 'expired' ? (
                <View style={{ gap: space[2], alignItems: 'flex-start' }}>
                  <Txt v="small" tone="no" accessibilityRole="alert" testID="code-expired">{A.expired}</Txt>
                  <Button small kind="secondary" label={A.newCode} onPress={() => send(true)} busy={busy} testID="new-code" />
                </View>
              ) : wait ? (
                <Txt v="small" testID="resend-wait">{resentNote ? `${A.resent}. ` : ''}{A.resendIn(`0:${String(wait).padStart(2, '0')}`)}</Txt>
              ) : (
                <Button small kind="quiet" label={A.resend} onPress={() => send(true)} testID="resend" style={{ alignSelf: 'flex-start', marginStart: -space[4] }} />
              )}
              <Button small kind="quiet" label={phoneMode ? A.otherPhone : t.login.back} onPress={back(from)} testID="use-other-email" style={{ alignSelf: 'flex-start', marginStart: -space[4] }} />
            </View>
          ) : null}
        </ScrollView>
        <View style={{ borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.bg, paddingHorizontal: space[4], paddingTop: space[3], paddingBottom: space[4], gap: space[2] }}>{footer}</View>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

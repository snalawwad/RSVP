// Create an event (Sara, 21 Nov 2026; beyond Sama's Figma, see the "Added by Sara" section there).
// Same screens as Sama's website flow (06 Name · 07 When · 08 Where · 10 Design · 11 Guests · 12 Review), one per page,
// but the app takes no payment (Apple): the last step sends a request (request_event_v2, 0008). The event is made as a
// draft and the team finalises it with the host on WhatsApp, payment included. No price, package name or website link.
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { createElement, useEffect, useState } from 'react';
import { BackHandler, Platform, Pressable, View } from 'react-native';
import { Button, Choice, EmptyState, Field, Icon, PressScale, Screen, Segmented, Txt } from '../../components';
import { myProfile, requestEvent } from '../../lib/api7';
import { haptics } from '../../lib/haptics';
import type { Lang } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { fonts, radius, scriptOf, size, space } from '../../theme/tokens';

type Design = 'we_design' | 'own' | 'simple';
type Style = 'classic' | 'modern' | 'minimal';
type Step = 'name' | 'when' | 'where' | 'design' | 'guests' | 'review';
const STEPS: Step[] = ['name', 'when', 'where', 'design', 'guests', 'review'];
/** the four tabs along the top (Sama: 01 Details · 02 Team · 03 Design · 04 Guests · 05 Send; the team is added later) */
const TAB_OF: Record<Step, number> = { name: 0, when: 0, where: 0, design: 1, guests: 2, review: 3 };
const TYPES = ['wedding', 'engagement', 'graduation', 'ghabga', 'dinner', 'other'] as const;
/** the website's colours (new.html COLOURS) */
const COLOURS: [string, string, string][] = [['#5B0F1D', 'Burgundy', 'عنابي'], ['#9C7A3C', 'Gold', 'ذهبي'], ['#5E6B3A', 'Olive', 'زيتي'], ['#1F3A5F', 'Navy', 'كحلي'], ['#B8646E', 'Rose', 'وردي'], ['#1A1A1A', 'Black', 'أسود']];
const pad = (n: number) => String(n).padStart(2, '0');
/** today in Kuwait as YYYY-MM-DD (the earliest date the picker offers) */
const kwToday = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
/** Kuwait wall-clock date + time → ISO (Kuwait is UTC+3 all year). */
const kwIso = (d: string, tm: string) => (d ? new Date(`${d}T${tm || '20:00'}:00+03:00`).toISOString() : null);
const digits = (s: string) => s.replace(/[٠-٩]/g, (x) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))).replace(/\D/g, '');
const fmtDay = (d: string, lang: Lang) => (d ? new Date(`${d}T12:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) : '');
const fmtClock = (tm: string, lang: Lang) => {
  if (!tm) return '';
  const [h, m] = tm.split(':').map(Number);
  const pm = h >= 12, h12 = ((h + 11) % 12) + 1;
  return `${h12}:${pad(m)} ${lang === 'ar' ? (pm ? 'م' : 'ص') : (pm ? 'PM' : 'AM')}`;
};

/** Date or time: the browser's own picker on the web, the system picker on a phone. value 'YYYY-MM-DD' or 'HH:MM'. */
function WhenField({ kind, label, value, onChange, testID }: { kind: 'date' | 'time'; label: string; value: string; onChange: (v: string) => void; testID?: string }) {
  const { c, t, lang } = useApp();
  const [open, setOpen] = useState(false);
  const box = { minHeight: 52, borderWidth: 1.5, borderColor: c.line, borderRadius: radius.m, backgroundColor: c.card, paddingHorizontal: 14, justifyContent: 'center' as const };
  if (Platform.OS === 'web') {
    return (
      <View style={{ flex: 1, gap: 6 }}>
        <Txt v="label" tone="muted">{label}</Txt>
        <View style={box}>
          {createElement('input', {
            type: kind, value, 'data-testid': testID, 'aria-label': label,
            min: kind === 'date' ? kwToday() : undefined,
            onChange: (e: { target: { value: string } }) => onChange(e.target.value),
            style: { border: 0, outline: 'none', background: 'transparent', color: value ? c.ink : c.muted, fontFamily: fonts.sans, fontSize: 16, width: '100%', minWidth: 0, height: 48, padding: 0, WebkitAppearance: 'none' },
          })}
        </View>
      </View>
    );
  }
  const now = new Date();
  const cur = kind === 'date' ? (value ? new Date(`${value}T12:00:00`) : now) : new Date(`2000-01-01T${value || '20:00'}:00`);
  const shown = !value ? t.a.rqPick : kind === 'date' ? fmtDay(value, lang) : fmtClock(value, lang);
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Txt v="label" tone="muted">{label}</Txt>
      <Button label={shown} kind="secondary" block onPress={() => setOpen(true)} testID={testID} />
      {open ? (
        <DateTimePicker value={cur} mode={kind} display={Platform.OS === 'ios' ? 'inline' : 'default'} minimumDate={kind === 'date' ? now : undefined}
          onChange={(e, d) => {
            if (Platform.OS !== 'ios' || e.type !== 'set') setOpen(false);
            if (e.type === 'dismissed' || !d) return;
            onChange(kind === 'date' ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` : `${pad(d.getHours())}:${pad(d.getMinutes())}`);
            if (Platform.OS === 'ios') setOpen(false);
          }} />
      ) : null}
    </View>
  );
}

/** How the invite will look (Sama 10 Design card): host line, name in the chosen colour, when, where. */
function Preview({ title, by, kind, date, time, venue, style, accent, evLang }: {
  title: string; by: string; /** the occasion as shown (a type's name, or what they typed for Other) */ kind: string; date: string; time: string; venue: string; style: Style; accent: string; evLang: Lang;
}) {
  const { c, t } = useApp();
  const A = t.a;
  const name = title.trim() || A.rqPrevName;
  const ar = scriptOf(name) === 'ar';
  const align = style === 'modern' ? 'flex-start' : 'center';
  const when = [fmtDay(date, evLang), fmtClock(time, evLang)].filter(Boolean).join(' · ');
  return (
    <View testID="rq-preview" style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.l, backgroundColor: '#FFFDFB', paddingVertical: space[6], paddingHorizontal: space[5], gap: 8, alignItems: align }}>
      {style !== 'minimal' ? <Icon name="arch" color={accent} /> : null}
      <Txt v="small" style={{ color: '#625350', textAlign: style === 'modern' ? 'auto' : 'center' }}>{by.trim() || A.rqPrevBy}</Txt>
      <Txt v="title" style={{ color: style === 'minimal' ? '#2A1B1D' : accent, textAlign: style === 'modern' ? 'auto' : 'center', fontSize: style === 'minimal' ? 26 : 32, lineHeight: style === 'minimal' ? 34 : 40,
        fontFamily: style === 'modern' ? (ar ? fonts.arDisplayBold : fonts.sansBold) : ar ? fonts.arDisplay : fonts.display, opacity: title.trim() ? 1 : 0.45 }}>{name}</Txt>
      {kind ? <Txt v="small" style={{ color: '#625350' }}>{kind}</Txt> : null}
      {when ? <Txt v="small" style={{ color: accent, fontWeight: '600', textAlign: style === 'modern' ? 'auto' : 'center' }}>{when}</Txt> : null}
      {venue.trim() ? <Txt v="small" style={{ color: '#625350' }}>{venue.trim()}</Txt> : null}
    </View>
  );
}

export default function NewEvent() {
  const { t, lang, c, rtl } = useApp();
  const A = t.a;
  const [step, setStep] = useState<Step>('name');
  const [title, setTitle] = useState('');
  const [by, setBy] = useState('');
  const [kind, setKind] = useState<string>('wedding');
  const [other, setOther] = useState('');   // "Other": the occasion in their own words
  const [date, setDate] = useState('');
  const [time, setTime] = useState('20:00');
  const [replyBy, setReplyBy] = useState('');
  const [venue, setVenue] = useState('');
  const [mapUrl, setMapUrl] = useState('');
  const [style, setStyle] = useState<Style>('classic');
  const [accent, setAccent] = useState(COLOURS[0][0]);
  const [evLang, setEvLang] = useState<Lang>(lang);
  const [design, setDesign] = useState<Design>('we_design');
  const [guests, setGuests] = useState('');
  const [door, setDoor] = useState<'yes' | 'no'>('no');
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');      // a send error (network, too many)
  const [tried, setTried] = useState(false); // Continue was pressed with something missing
  const [done, setDone] = useState(false);

  useEffect(() => { myProfile().then((r) => { if (r.data?.phone) setContact((v) => v || r.data!.phone!.replace(/^965/, '')); }); }, []);

  const i = STEPS.indexOf(step);
  const back = () => { setErr(''); setTried(false); if (i > 0) setStep(STEPS[i - 1]); else router.back(); };
  useEffect(() => {
    if (done) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { back(); return true; });
    return () => sub.remove();
  });

  const phone = digits(contact);
  // the "add the …" message goes away as soon as the missing thing is filled in
  const can: Record<Step, boolean> = { name: title.trim().length > 0 && (kind !== 'other' || other.trim().length > 0), when: !!date, where: true, design: true, guests: true, review: phone.length >= 8 };
  const need: Record<Step, string> = { name: !title.trim() ? A.rqNeedName : A.rqNeedOther, when: A.rqNeedDate, where: '', design: '', guests: '', review: A.rqNeedPhone };

  function next() {
    if (!can[step]) { setTried(true); return; }
    setErr(''); setTried(false);
    if (step === 'review') { void send(); return; }
    setStep(STEPS[i + 1]);
  }

  async function send() {
    setBusy(true);
    const n = parseInt(digits(guests), 10);
    const r = await requestEvent({
      event: {
        title: title.trim(), invite_line: by.trim() || null, event_type: kind === 'other' ? other.trim() || 'other' : kind, starts_at: kwIso(date, time),
        rsvp_deadline: replyBy ? kwIso(replyBy, '23:59') : null, venue: venue.trim() || null, map_url: /^https?:\/\//.test(mapUrl.trim()) ? mapUrl.trim() : null,
        lang: evLang, design_style: style, theme_accent: accent,
      },
      guests: Number.isFinite(n) && n > 0 ? Math.min(n, 5000) : null, door: door === 'yes', design,
      contact: phone.length === 8 ? `965${phone}` : phone, notes: notes.trim() || undefined,
    });
    setBusy(false);
    if (r.error) { setErr(/TOO_MANY/.test(r.error.message) ? A.rqTooMany : A.rqErr); return; }
    haptics.success?.();
    setDone(true);
  }

  if (done) {
    return (
      <Screen testID="rq-done">
        <EmptyState title={A.rqDoneH} body={A.rqDoneP} testID="rq-done-msg"
          action={<Button kind="primary" big block label={A.rqDoneB} onPress={() => router.dismissTo('/')} testID="rq-back" />} />
      </Screen>
    );
  }

  const kindLabel = kind === 'other' ? other.trim() : A.rqTypes[kind];
  const preview = <Preview title={title} by={by} kind={kindLabel} date={date} time={time} venue={venue} style={style} accent={accent} evLang={evLang} />;
  const line = (k: string, v: string, to: Step) => (
    <Pressable key={k} onPress={() => setStep(to)} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 52, borderBottomWidth: 1, borderColor: c.line }}>
      <Txt v="body" tone="muted" style={{ flex: 1 }}>{k}</Txt>
      <Txt v="body" style={{ flexShrink: 1, textAlign: 'right' }} numberOfLines={2}>{v || '—'}</Txt>
      <Icon name="chev" color={c.muted} flip={rtl} />
    </Pressable>
  );

  let body = null;
  if (step === 'name') {
    body = (
      <>
        <Field label={A.rqName} placeholder={A.rqNamePh} value={title} onChangeText={setTitle} maxLength={120} testID="rq-title" />
        <Field label={A.rqBy} placeholder={A.rqByPh} value={by} onChangeText={setBy} maxLength={300} testID="rq-by" />
        <View style={{ gap: space[2] }}>
          <Txt v="label" tone="muted">{A.rqType}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {TYPES.map((k) => <Button key={k} small kind={kind === k ? 'primary' : 'secondary'} label={A.rqTypes[k]} onPress={() => setKind(k)} testID={`rq-type-${k}`} />)}
          </View>
          {kind === 'other' ? <Field label={A.rqOther} placeholder={A.rqOtherPh} value={other} onChangeText={setOther} maxLength={40} autoFocus testID="rq-other" /> : null}
        </View>
        <View style={{ gap: space[2] }}><Txt v="label" tone="muted">{A.rqPreview}</Txt>{preview}</View>
      </>
    );
  } else if (step === 'when') {
    body = (
      <>
        <View style={{ flexDirection: 'row', gap: space[3] }}>
          <WhenField kind="date" label={A.rqDate} value={date} onChange={setDate} testID="rq-date" />
          <WhenField kind="time" label={A.rqTime} value={time} onChange={setTime} testID="rq-time" />
        </View>
        <WhenField kind="date" label={A.rqReplyBy} value={replyBy} onChange={setReplyBy} testID="rq-reply" />
        <Txt v="small" tone="muted">{A.rqReplyByP}</Txt>
      </>
    );
  } else if (step === 'where') {
    body = (
      <>
        <Field label={A.rqVenue} placeholder={A.rqVenuePh} value={venue} onChangeText={setVenue} maxLength={200} testID="rq-venue" />
        <Field label={A.rqMap} placeholder="https://maps.app.goo.gl/…" value={mapUrl} onChangeText={setMapUrl} maxLength={500} ltr autoCapitalize="none" keyboardType="url" testID="rq-map" />
      </>
    );
  } else if (step === 'design') {
    body = (
      <>
        {preview}
        <View style={{ gap: space[2] }}>
          <Txt v="label" tone="muted">{A.rqStyle}</Txt>
          <Segmented fill label={A.rqStyle} value={style} onChange={setStyle} testID="rq-style"
            options={[{ key: 'classic', label: A.rqStyles.classic }, { key: 'modern', label: A.rqStyles.modern }, { key: 'minimal', label: A.rqStyles.minimal }]} />
        </View>
        <View style={{ gap: space[2] }}>
          <Txt v="label" tone="muted">{A.rqColour}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }} accessibilityRole="radiogroup" accessibilityLabel={A.rqColour}>
            {COLOURS.map(([hex, en, ar]) => (
              <PressScale key={hex} kind="chip" accessibilityRole="radio" accessibilityState={{ checked: accent === hex }} accessibilityLabel={lang === 'ar' ? ar : en} onPress={() => setAccent(hex)} testID={`rq-col-${hex.slice(1)}`}
                style={{ width: size.target, height: size.target, borderRadius: 999, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: accent === hex ? c.ink : 'transparent' }}>
                <View style={{ width: 32, height: 32, borderRadius: 999, backgroundColor: hex }} />
              </PressScale>
            ))}
          </View>
        </View>
        <View style={{ gap: space[2] }}>
          <Txt v="label" tone="muted">{A.rqLang}</Txt>
          <Segmented fill label={A.rqLang} value={evLang} onChange={setEvLang} testID="rq-lang" options={[{ key: 'ar', label: t.arabic }, { key: 'en', label: t.english }]} />
        </View>
        <View style={{ gap: space[2] }}>
          <Txt v="label" tone="muted">{A.rqDesign}</Txt>
          <Choice on={design === 'own'} title={A.rqDesignOwn} sub={A.rqDesignOwnS} onPress={() => setDesign('own')} testID="rq-design-own" />
          <Choice on={design === 'we_design'} title={A.rqDesignWe} sub={A.rqDesignWeS} onPress={() => setDesign('we_design')} testID="rq-design-we" />
          <Choice on={design === 'simple'} title={A.rqDesignSimple} sub={A.rqDesignSimpleS} onPress={() => setDesign('simple')} testID="rq-design-simple" />
        </View>
      </>
    );
  } else if (step === 'guests') {
    body = (
      <>
        <Field label={A.rqGuests} placeholder={A.rqGuestsPh} value={guests} onChangeText={setGuests} keyboardType="number-pad" maxLength={5} testID="rq-guests" />
        <View style={{ gap: space[2] }}>
          <Txt v="label" tone="muted">{A.rqDoor}</Txt>
          <Segmented fill label={A.rqDoor} value={door} onChange={setDoor} testID="rq-door" options={[{ key: 'yes', label: A.rqDoorYes }, { key: 'no', label: A.rqDoorNo }]} />
          <Txt v="small" tone="muted">{A.rqDoorP}</Txt>
        </View>
        <Txt v="small" tone="muted">{A.rqGuestsLater}</Txt>
      </>
    );
  } else {
    const designWord = design === 'own' ? A.rqDesignOwn : design === 'we_design' ? A.rqDesignWe : A.rqDesignSimple;
    body = (
      <>
        <View style={{ borderTopWidth: 1, borderColor: c.line }}>
          {line(A.rqName, title.trim(), 'name')}
          {line(A.rqType, kindLabel, 'name')}
          {line(A.rqWhen, [fmtDay(date, lang), fmtClock(time, lang)].filter(Boolean).join(' · '), 'when')}
          {line(A.rqVenue, venue.trim(), 'where')}
          {line(A.rqDesign, `${A.rqStyles[style]} · ${designWord}`, 'design')}
          {line(A.rqGuestsShort, [guests ? digits(guests) : '', door === 'yes' ? A.rqDoorShort : ''].filter(Boolean).join(' · '), 'guests')}
        </View>
        <Field label={A.rqContact} help={A.rqContactP} placeholder="9XXXXXXX" value={contact} onChangeText={setContact} keyboardType="phone-pad" maxLength={16} ltr testID="rq-contact" />
        <Field label={A.rqNotes} placeholder={A.rqNotesPh} value={notes} onChangeText={setNotes} multiline maxLength={2000} style={{ minHeight: 96, textAlignVertical: 'top' }} testID="rq-notes" />
      </>
    );
  }

  const heads: Record<Step, [string, string]> = {
    name: [A.rqNameH, A.rqNameP], when: [A.rqWhenH, A.rqWhenP], where: [A.rqWhereH, A.rqWhereP],
    design: [A.rqDesignH, A.rqDesignP], guests: [A.rqGuestsH, A.rqGuestsP], review: [A.rqReviewH, A.rqReviewP],
  };
  const tabs = [A.rqTabDetails, A.rqTabDesign, A.rqTabGuests, A.rqTabSend];

  return (
    <Screen gap={space[5]} testID={`rq-step-${step}`} edges={['top', 'left', 'right', 'bottom']}
      header={(
        <View style={{ gap: space[3] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={t.back} hitSlop={4} onPress={back} testID="rq-step-back"
              style={{ width: size.target, height: size.target, borderRadius: 999, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="chev" color={c.plum} flip={!rtl} />
            </PressScale>
            <Txt v="name" style={{ flex: 1 }} numberOfLines={1}>{title.trim() || A.rqNew}</Txt>
          </View>
          <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: c.line }} accessibilityRole="tablist">
            {tabs.map((label, k) => {
              const on = TAB_OF[step] === k, past = TAB_OF[step] > k;
              return (
                <View key={label} style={{ flex: 1, alignItems: 'center', paddingBottom: 8, borderBottomWidth: 2, borderColor: on ? c.plum : 'transparent' }} accessibilityState={{ selected: on }}>
                  <Txt v="name" style={{ fontFamily: fonts.display, color: on || past ? c.plum : c.muted }}>{pad(k + 1)}</Txt>
                  <Txt v="small" style={{ color: on ? c.ink : c.muted }}>{label}</Txt>
                </View>
              );
            })}
          </View>
        </View>
      )}
      footer={(
        <View style={{ gap: space[2] }}>
          {err || (tried && !can[step]) ? <Txt v="small" tone="no" testID="rq-err">{err || need[step]}</Txt> : null}
          <Button kind="primary" big block label={step === 'review' ? A.rqSend : A.rqContinue} busy={busy} onPress={next} testID={step === 'review' ? 'rq-send' : 'rq-next'} />
        </View>
      )}>
      <View style={{ gap: space[2] }}>
        <Txt v="title" accessibilityRole="header">{heads[step][0]}</Txt>
        <Txt v="body" tone="muted">{heads[step][1]}</Txt>
      </View>
      {body}
    </Screen>
  );
}

// Create an event (Sara, 21 Nov 2026; beyond Sama's Figma, see the "Added by Sara" section there).
// The app takes no payment (Apple), so this sends a request: the host fills in what the team needs, the event is
// made as a draft (request_event_v2, 0008), and the team finalises it with the host on WhatsApp, payment included.
// No price, package name, "buy" or website link here.
import DateTimePicker from '@react-native-community/datetimepicker';
import { router } from 'expo-router';
import { createElement, useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { Button, Choice, EmptyState, Field, Screen, Segmented, Txt } from '../../components';
import { myProfile, requestEvent } from '../../lib/api7';
import { haptics } from '../../lib/haptics';
import type { Lang } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { fonts, radius, space } from '../../theme/tokens';

type Design = 'we_design' | 'own' | 'simple';
const TYPES = ['wedding', 'engagement', 'graduation', 'ghabga', 'dinner', 'other'] as const;
const pad = (n: number) => String(n).padStart(2, '0');
/** Kuwait wall-clock date + time → ISO (Kuwait is UTC+3 all year). */
const kwIso = (d: string, tm: string) => (d ? new Date(`${d}T${tm || '20:00'}:00+03:00`).toISOString() : null);
const digits = (s: string) => s.replace(/[٠-٩]/g, (x) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(x))).replace(/\D/g, '');

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
            min: kind === 'date' ? new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10) : undefined,
            onChange: (e: { target: { value: string } }) => onChange(e.target.value),
            style: { border: 0, outline: 'none', background: 'transparent', color: value ? c.ink : c.muted, fontFamily: fonts.sans, fontSize: 16, width: '100%', minWidth: 0, height: 48, padding: 0, WebkitAppearance: 'none' },
          })}
        </View>
      </View>
    );
  }
  const now = new Date();
  const cur = kind === 'date' ? (value ? new Date(`${value}T12:00:00`) : now) : new Date(`2000-01-01T${value || '20:00'}:00`);
  const shown = !value ? t.a.rqPick : kind === 'date'
    ? new Date(`${value}T12:00:00`).toLocaleDateString(lang === 'ar' ? 'ar-KW-u-nu-latn' : 'en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
    : value;
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

export default function NewEvent() {
  const { t, lang } = useApp();
  const A = t.a;
  const [title, setTitle] = useState('');
  const [type, setType] = useState<string>('wedding');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('20:00');
  const [venue, setVenue] = useState('');
  const [guests, setGuests] = useState('');
  const [door, setDoor] = useState<'yes' | 'no'>('no');
  const [design, setDesign] = useState<Design>('we_design');
  const [evLang, setEvLang] = useState<Lang>(lang);
  const [contact, setContact] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => { myProfile().then((r) => { if (r.data?.phone) setContact((v) => v || r.data!.phone!.replace(/^965/, '')); }); }, []);

  const phone = digits(contact);
  const ready = title.trim().length > 0 && !!date && phone.length >= 8;

  async function send() {
    if (!ready) { setErr(A.rqNeed); return; }
    setErr(''); setBusy(true);
    const n = parseInt(digits(guests), 10);
    const r = await requestEvent({
      event: { title: title.trim(), event_type: type, starts_at: kwIso(date, time), venue: venue.trim() || null, lang: evLang },
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

  return (
    <Screen gap={space[5]} testID="rq-form"
      footer={(
        <View style={{ gap: space[2] }}>
          {err ? <Txt v="small" tone="no" testID="rq-err">{err}</Txt> : null}
          <Button kind="primary" big block label={A.rqSend} busy={busy} onPress={send} testID="rq-send" />
        </View>
      )}>
      <View style={{ gap: space[2] }}>
        <Txt v="title" accessibilityRole="header">{A.rqH}</Txt>
        <Txt v="body" tone="muted">{A.rqP}</Txt>
      </View>

      <Field label={A.rqName} placeholder={A.rqNamePh} value={title} onChangeText={setTitle} maxLength={120} testID="rq-title" />

      <View style={{ gap: space[2] }}>
        <Txt v="label" tone="muted">{A.rqType}</Txt>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {TYPES.map((k) => (
            <Button key={k} small kind={type === k ? 'primary' : 'secondary'} label={A.rqTypes[k]} onPress={() => setType(k)} testID={`rq-type-${k}`} />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: space[3] }}>
        <WhenField kind="date" label={A.rqDate} value={date} onChange={setDate} testID="rq-date" />
        <WhenField kind="time" label={A.rqTime} value={time} onChange={setTime} testID="rq-time" />
      </View>

      <Field label={A.rqVenue} placeholder={A.rqVenuePh} value={venue} onChangeText={setVenue} maxLength={200} testID="rq-venue" />
      <Field label={A.rqGuests} placeholder={A.rqGuestsPh} value={guests} onChangeText={setGuests} keyboardType="number-pad" maxLength={5} testID="rq-guests" />

      <View style={{ gap: space[2] }}>
        <Txt v="label" tone="muted">{A.rqDoor}</Txt>
        <Segmented fill label={A.rqDoor} value={door} onChange={setDoor} testID="rq-door"
          options={[{ key: 'yes', label: A.rqDoorYes }, { key: 'no', label: A.rqDoorNo }]} />
        <Txt v="small" tone="muted">{A.rqDoorP}</Txt>
      </View>

      <View style={{ gap: space[2] }}>
        <Txt v="label" tone="muted">{A.rqDesign}</Txt>
        <Choice on={design === 'we_design'} title={A.rqDesignWe} sub={A.rqDesignWeS} onPress={() => setDesign('we_design')} testID="rq-design-we" />
        <Choice on={design === 'own'} title={A.rqDesignOwn} sub={A.rqDesignOwnS} onPress={() => setDesign('own')} testID="rq-design-own" />
        <Choice on={design === 'simple'} title={A.rqDesignSimple} sub={A.rqDesignSimpleS} onPress={() => setDesign('simple')} testID="rq-design-simple" />
      </View>

      <View style={{ gap: space[2] }}>
        <Txt v="label" tone="muted">{A.rqLang}</Txt>
        <Segmented fill label={A.rqLang} value={evLang} onChange={setEvLang} testID="rq-lang"
          options={[{ key: 'ar', label: t.arabic }, { key: 'en', label: t.english }]} />
      </View>

      <Field label={A.rqContact} help={A.rqContactP} placeholder="9XXXXXXX" value={contact} onChangeText={setContact} keyboardType="phone-pad" maxLength={16} ltr testID="rq-contact" />
      <Field label={A.rqNotes} placeholder={A.rqNotesPh} value={notes} onChangeText={setNotes} multiline maxLength={2000} style={{ minHeight: 96, textAlignVertical: 'top' }} testID="rq-notes" />
    </Screen>
  );
}

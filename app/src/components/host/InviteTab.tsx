// INVITE (host.html #pg-invite): personal invitations first (send one by one), then the invite's details with
// one save bar, the WhatsApp message (shown as the guest reads it; the reply link is required), the group link
// (secondary), the package, and the activity log.
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { Image, Linking, Platform, Pressable, Share, Switch, TextInput, View } from 'react-native';
import { config } from '../../lib/config';
import { auditLog, setRules, updateEvent, why, type AuditRow, type EventRow } from '../../lib/api';
import { fmtDate, fmtTime, shortDate } from '../../lib/format';
import { stats, sumSeats } from '../../lib/guests';
import { haptics } from '../../lib/haptics';
import { defaultTemplate, fillTemplate, isDefaultTemplate, publicLink, shareWhatsApp, templateFor } from '../../lib/links';
import type { Lang } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { textStart } from '../../theme/dir';
import { fonts, radius, scriptOf, size, space, textStyle } from '../../theme/tokens';
import { Button } from '../Button';
import { Segmented } from '../Chip';
import { useToast } from '../Feedback';
import { Field } from '../Field';
import { Icon } from '../Icon';
import { Panel } from '../Panel';
import { PressScale } from '../Press';
import { Screen } from '../Screen';
import { Sheet } from '../Sheet';
import { Tag } from '../Tag';
import { Txt } from '../Txt';
import { useHost } from './HostContext';
import { Group, Meta, PanelHead, Paper, useFolds, usePull } from './parts';

// the parts of the message that fill in for each guest: shown as [words] in the editor, never {codes}
const TOKS = { name: 'الاسم', date: 'التاريخ', time: 'الوقت', venue: 'المكان', event: 'المناسبة', link: 'الرابط', invites: 'العدد' } as const;
type TokKey = keyof typeof TOKS;
const TOK_RE = /\{(name|date|time|venue|event|link|invites|الاسم|التاريخ|الوقت|المكان|المناسبة|الرابط|العدد)\}/g;
const tokKey = (w: string) => ((w in TOKS ? w : (Object.keys(TOKS) as TokKey[]).find((k) => TOKS[k] === w)) as TokKey);
const hasLink = (s: string) => /\{(link|الرابط)\}/.test(s || '');
const cut = (s: string) => String(s || '').replace(/\s+/g, ' ').trim();

type Form = { title: string; line: string; note: string; head: string; lang: Lang; venue: string; map: string; tpl: string; allow: boolean; linkOn: boolean };
const formOf = (e: EventRow): Form => ({
  title: e.title || '', line: e.invite_line || '', note: e.note || '', head: e.headline || '', lang: e.lang === 'en' ? 'en' : 'ar',
  venue: e.venue || '', map: e.map_url || '', tpl: templateFor(e), allow: e.allow_changes !== false, linkOn: e.public_link_enabled !== false,
});
const EF: (keyof Form)[] = ['title', 'line', 'note', 'head', 'lang', 'venue', 'map', 'tpl'];

export function InviteTab() {
  const { t, c, lang, rtl } = useApp();
  const T = t.host;
  const h = useHost();
  const toast = useToast();
  const pull = usePull();
  const folds = useFolds<'g1' | 'g2' | 'g3' | 'rules' | 'pub' | 'log' | 'msg'>();
  const ev = h.ev;
  const [form, setForm] = useState<Form | null>(ev ? formOf(ev) : null);
  const [snap, setSnap] = useState<Form | null>(form);
  const [errs, setErrs] = useState<Partial<Record<'title' | 'venue', string>>>({});
  const [busy, setBusy] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [chg, setChg] = useState<string[] | null>(null);
  const [copied, setCopied] = useState(false);
  const [log, setLog] = useState<AuditRow[] | null | 'err'>(null);
  // where the caret was in the message (-1: never touched → add at the end)
  const sel = useRef({ start: -1, end: -1 });
  const edRef = useRef<ComponentRef<typeof TextInput>>(null);
  const [edH, setEdH] = useState(150);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rulesOn = h.v2 && !h.mySide;
  const dirty = !!form && !!snap && (EF.some((k) => form[k] !== snap[k]) || (rulesOn && (form.allow !== snap.allow || form.linkOn !== snap.linkOn)));
  // a fresh form when the event loads (or is saved elsewhere) and nothing is being changed here
  const [evSeen, setEvSeen] = useState(ev);
  if (ev !== evSeen) { setEvSeen(ev); if (ev && !dirty) { const f = formOf(ev); setForm(f); setSnap(f); } }
  useEffect(() => () => { if (savedTimer.current) clearTimeout(savedTimer.current); }, []);

  const loadLog = useCallback(async () => {
    const { data, error } = await auditLog(h.id);
    setLog(error ? 'err' : (data || []).filter((a) => a.action !== 'door_open_list').slice(0, 100));
  }, [h.id]);

  if (!ev || !form || !snap) return <Screen edges={['left', 'right']}><View /></Screen>;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => (f ? { ...f, [k]: v } : f));
  const s = stats(h.guests), n = s.unsent.length;

  // ---------- the message editor ----------
  const L: Lang = form.lang;
  const toDisp = (raw: string) => raw.replace(TOK_RE, (_m, w: string) => `[${T.tok[tokKey(w)]}]`);
  const toRaw = (disp: string) => (Object.keys(TOKS) as TokKey[]).reduce((s2, k) => s2.split(`[${T.tok[k]}]`).join(`{${L === 'en' ? k : TOKS[k]}}`), disp);
  const disp = toDisp(form.tpl);
  // the message reads in its own direction (web dir=auto): an Arabic message is right to left even in the English screen
  const edRtl = disp.trim() ? scriptOf(disp.replace(/\[[^\]]*\]/g, '')) === 'ar' : rtl;
  function insertTok(k: TokKey) {
    // the web's textarea knows its caret even after the tap moved focus to the detail button
    const dom = Platform.OS === 'web' ? (edRef.current as unknown as { selectionStart?: number; selectionEnd?: number } | null) : null;
    const s0 = dom && typeof dom.selectionStart === 'number' ? { start: dom.selectionStart, end: dom.selectionEnd ?? dom.selectionStart } : sel.current;
    const d = disp, a = s0.start < 0 ? d.length : Math.min(s0.start, d.length), b = s0.end < 0 ? d.length : Math.min(s0.end, d.length);
    const before = d.slice(0, a), after = d.slice(b), chip = `[${T.tok[k]}]`;
    const pre = before && !/[\sـ]$/.test(before) ? ' ' : '';
    const post = after && /^[\s.,،!؟?:]/.test(after) ? '' : ' ';
    const nd = before + pre + chip + post + after;
    const at = (before + pre + chip + post).length;
    sel.current = { start: at, end: at };
    set('tpl', toRaw(nd));
    haptics.tap();
  }
  const sample = h.guests.find((x) => x.phone && x.status === 'pending') || h.guests.find((x) => x.phone) || h.guests[0] || { name: T.sampleName, seats: 2, token: 'preview' };
  const previewEv = { ...ev, title: form.title, headline: form.head, venue: form.venue, lang: form.lang };
  const msg = fillTemplate(form.tpl, previewEv, sample);

  // ---------- save (only the fields that changed; never a blank over a saved name or venue) ----------
  async function save() {
    if (!form || !snap || !ev) return;
    if (!hasLink(form.tpl)) { folds.set('g3', true); toast(T.needLink); haptics.error(); return; }
    const patch: Partial<EventRow> = {}, held: ('title' | 'venue')[] = [];
    const ch = (k: keyof Form) => form[k] !== snap[k];
    if (ch('title')) { if (form.title.trim()) patch.title = form.title.trim(); else held.push('title'); }
    if (ch('line')) patch.invite_line = form.line;
    if (ch('note')) patch.note = form.note;
    if (ch('head')) patch.headline = form.head;
    if (ch('map')) patch.map_url = form.map;
    if (ch('lang')) patch.lang = form.lang;
    if (ch('venue')) { if (form.venue.trim() || !snap.venue.trim()) patch.venue = form.venue; else held.push('venue'); }
    // the message is saved only when it's the host's own; an untouched default stays empty, so it follows the invite language
    if (ch('tpl') && (ev.message_template || form.tpl !== defaultTemplate(form.lang))) patch.message_template = form.tpl;
    if (held.length) {
      const m = { title: T.needName, venue: T.needVenue };
      setErrs(Object.fromEntries(held.map((k) => [k, m[k]])));
      folds.set(held[0] === 'title' ? 'g1' : 'g2', true);
      toast(m[held[0]]); haptics.error();
      return;
    }
    setErrs({});
    setBusy(true);
    const beforeV = (ev.venue || '').trim();
    let next: EventRow = ev;
    if (Object.keys(patch).length) {
      const { data, error } = await updateEvent(ev.id, patch);
      if (error) { setBusy(false); toast(T.cantSave(why(error))); haptics.error(); return; }
      next = { ...next, ...(data || patch) };
    }
    if (rulesOn && (form.allow !== snap.allow || form.linkOn !== snap.linkOn)) {
      const { data, error } = await setRules(ev.id, ev.rsvp_deadline ?? null, form.allow, form.linkOn);
      if (error) { setBusy(false); h.setEv(next); toast(T.cantSave(why(error))); haptics.error(); return; }
      next = { ...next, ...(data || {}) };
    }
    setBusy(false);
    h.setEv(next);
    const f = formOf(next); setForm(f); setSnap(f);
    toast(T.saved); haptics.success();
    setJustSaved(true); if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setJustSaved(false), 1800);
    // the place changed: offer to tell the guests who already have the invitation (nothing is sent on its own)
    if ((next.venue || '').trim() !== beforeV) {
      const list = h.guests.filter((g) => g.phone && g.sent_at);
      if (list.length) setChg(list.map((g) => g.id));
    }
  }

  // ---------- the group link ----------
  const link = ev.public_code ? publicLink(ev.public_code) : '';
  const shareMsg = ev.lang === 'en'
    ? `You’re invited to ${ev.invite_line ? ev.invite_line.replace(/^Join us for /i, '') : ev.headline || ev.title}${ev.starts_at ? ' on ' + fmtDate(ev.starts_at, 'en') + ' at ' + fmtTime(ev.starts_at, 'en') : ''}.\n\nPlease tap the link, type your name and let us know if you can make it:\n${link}`
    : `حياكم الله\n\nنتشرف بدعوتكم لحضور ${ev.headline || ev.title}${ev.starts_at ? ' يوم ' + fmtDate(ev.starts_at, 'ar') + ' الساعة ' + fmtTime(ev.starts_at, 'ar') : ''}\n\nلتأكيد الحضور أو الاعتذار:\n${link}`;
  async function copy() {
    try {
      if (Platform.OS === 'web') await navigator.clipboard.writeText(link);
      else { await Share.share({ message: link }); return; }   // native: the share sheet has Copy (no clipboard module in this build)
    } catch { toast(`${T.copyPrompt} ${link}`); return; }
    setCopied(true); haptics.success(); setTimeout(() => setCopied(false), 1600);
  }

  // ---------- the package ----------
  const used = sumSeats(h.guests), lim = ev.invite_limit, left = lim == null ? 0 : Math.max(0, lim - used), low = lim != null && left < 10;
  const wa = (config.supportWhatsApp || '').replace(/\D/g, '');

  // ---------- previews in the closed groups ----------
  const pv2 = [ev.starts_at ? `${shortDate(ev.starts_at, lang)} · ${fmtTime(ev.starts_at, lang)}` : T.noDate, cut(form.venue)].filter(Boolean).join(' · ');
  const deadline = ev.rsvp_deadline ? shortDate(ev.rsvp_deadline, lang) : '';

  const cardMini = ev.card_image_url ? (
    <Image source={{ uri: ev.card_image_url }} accessibilityLabel={T.cardAlt} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
  ) : (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 10, backgroundColor: ev.theme_paper || '#EDE5DA' }}>
      <Txt v="button" center color={ev.theme_accent || '#5B0F1D'} style={{ fontFamily: scriptOf(ev.headline || ev.title) === 'ar' ? fonts.arDisplay : fonts.display }}>{ev.headline || ev.title}</Txt>
    </View>
  );
  const invLine = ev.invite_line || ev.headline || ev.title;
  const sw = (on: boolean, onChange: (v: boolean) => void, label: string, testID: string) => (
    <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} accessibilityLabel={label} onPress={() => onChange(!on)} testID={testID}
      style={{ minHeight: size.target, flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <Txt v="body" style={{ flex: 1 }}>{label}</Txt>
      <Switch value={on} onValueChange={onChange} trackColor={{ true: c.plum, false: c.line }} thumbColor={c.card} {...({ activeThumbColor: c.card } as object)} />
    </Pressable>
  );

  const footer = dirty ? (
    <View testID="save-bar" style={{ gap: 6 }}>
      <Txt v="label">{T.unsaved}</Txt>
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Button small kind="quiet" label={T.discard} style={{ flex: 1 }} onPress={() => { setForm(snap); setErrs({}); }} testID="discard" />
        <Button small kind="primary" label={T.saveChanges} busy={busy} style={{ flex: 1 }} onPress={save} testID="save" />
      </View>
    </View>
  ) : justSaved ? <View testID="save-bar"><Txt v="label" tone="ok">{T.allSaved}</Txt></View> : null;

  return (
    <View style={{ flex: 1 }}>
      <Screen edges={['left', 'right']} bottom={dirty ? 24 : 96} gap={space[3]} {...pull} footer={footer} testID="host-invite">
        {/* personal invitations: the main action */}
        <Panel testID="inv-send" gap={space[1]}>
          <PanelHead>{T.persH}</PanelHead>
          <Txt v="body" tone="muted" style={{ marginBottom: 10 }}>{T.persP}</Txt>
          {n ? (
            <Button big block kind={dirty ? 'secondary' : 'primary'} icon="whatsapp" label={T.nSendB(n)} onPress={() => h.startQueue('send', s.unsent.map((g) => g.id))} testID="inv-go" />
          ) : (
            <>
              <Txt v="small" tone="ink" style={{ marginBottom: space[3] }}>{h.guests.length ? T.persAll : T.persNone}</Txt>
              <Button block kind="secondary" icon="plus" label={T.addGuestsB} onPress={() => { h.go('guests'); h.openAdd(false); }} testID="inv-add" />
            </>
          )}
        </Panel>

        {/* the invite at a glance */}
        <View style={{ flexDirection: 'row', gap: space[4], alignItems: 'center', marginTop: space[1], marginBottom: space[2] }}>
          <View style={{ width: 96, height: 126, borderRadius: radius.m, overflow: 'hidden', borderWidth: 1, borderColor: c.line, backgroundColor: c.surface }}>{cardMini}</View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Txt v="name" style={{ fontFamily: scriptOf(invLine) === 'ar' ? fonts.arDisplay : fonts.display }}>{invLine}</Txt>
            <Txt v="small">{ev.starts_at ? `${fmtDate(ev.starts_at, lang)} · ${fmtTime(ev.starts_at, lang)}` : T.noDate}</Txt>
            {ev.venue ? <Txt v="small">{ev.venue}</Txt> : null}
            {link ? <Button small kind="secondary" icon="arch" label={T.seeGuest} style={{ marginTop: space[2] }} onPress={() => Linking.openURL(link).catch(() => {})} testID="see-guest" /> : null}
          </View>
        </View>

        <Txt v="name" accessibilityRole="header">{T.editH}</Txt>
        <Group title={T.grp1} preview={cut(form.title)} open={folds.isOpen('g1')} onToggle={() => folds.toggle('g1')} testID="grp1">
          <Field label={T.evName} value={form.title} onChangeText={(v) => { set('title', v); setErrs((e) => ({ ...e, title: undefined })); }} error={errs.title} testID="e-title" />
          <Field label={T.line} value={form.line} onChangeText={(v) => set('line', v)} placeholder={T.linePh} testID="e-line" />
          <Field label={T.note} value={form.note} onChangeText={(v) => set('note', v)} placeholder={T.notePh} help={T.noteHelp} multiline style={{ minHeight: 96, textAlignVertical: 'top' }} testID="e-note" />
          <Field label={T.head} value={form.head} onChangeText={(v) => set('head', v)} testID="e-head" />
          <View style={{ gap: 6 }}>
            <Txt v="label" tone="muted">{T.invLang}</Txt>
            <Segmented<Lang> label={T.invLang} value={form.lang} testID="e-lang"
              onChange={(k) => setForm((f) => (f ? { ...f, lang: k, tpl: isDefaultTemplate(f.tpl) ? defaultTemplate(k) : f.tpl } : f))}
              options={[{ key: 'en', label: 'English' }, { key: 'ar', label: 'العربية' }]} />
          </View>
        </Group>
        <Group title={T.grp2} preview={pv2} open={folds.isOpen('g2')} onToggle={() => folds.toggle('g2')} testID="grp2">
          <View style={{ gap: 2 }}>
            <Txt v="label" tone="muted">{T.date}</Txt>
            <Txt v="body">{ev.starts_at ? `${fmtDate(ev.starts_at, lang)} · ${fmtTime(ev.starts_at, lang)}` : T.noDate}</Txt>
          </View>
          <Field label={T.venue} value={form.venue} onChangeText={(v) => { set('venue', v); setErrs((e) => ({ ...e, venue: undefined })); }} error={errs.venue} testID="e-venue" />
          <Field label={T.map} value={form.map} onChangeText={(v) => set('map', v)} ltr keyboardType="url" autoCapitalize="none" autoCorrect={false} testID="e-map" />
        </Group>
        <Group title={T.grp3} preview={cut(msg)} open={folds.isOpen('g3')} onToggle={() => folds.toggle('g3')} testID="grp3">
          <Txt v="label" tone="muted">{T.waMsg}</Txt>
          <View style={{ borderRadius: radius.m, borderWidth: 1, borderColor: c.fieldLine, backgroundColor: c.card }}>
            <TextInput ref={edRef} multiline value={disp} accessibilityLabel={T.waMsg} testID="tpl-ed" textAlignVertical="top" autoCorrect={false} spellCheck={false}
              onChangeText={(d) => set('tpl', toRaw(d))} onContentSizeChange={(e) => { const nx = Math.max(150, Math.ceil(e.nativeEvent.contentSize.height)); setEdH((h0) => (Math.abs(h0 - nx) > 4 ? nx : h0)); }} onSelectionChange={(e) => { sel.current = e.nativeEvent.selection; }}
              selectionColor={c.plum}
              style={[textStyle('body', scriptOf(disp) === 'ar' ? 'ar' : rtl ? 'ar' : 'lat'), { minHeight: 150, height: edH, padding: space[3], color: c.ink, textAlign: textStart(edRtl), writingDirection: edRtl ? 'rtl' : 'ltr', lineHeight: 28, outlineStyle: 'none' } as object]} />
          </View>
          {!hasLink(form.tpl) ? (
            <Panel tone="no" flat testID="tpl-warn" gap={10}>
              <Txt v="label" tone="no">{T.needLink}</Txt>
              <Button small kind="secondary" icon="link" label={T.putLink} testID="put-link"
                onPress={() => set('tpl', form.tpl.replace(/\s+$/, '') + `\n{${L === 'en' ? 'link' : 'الرابط'}}`)} />
            </Panel>
          ) : null}
          <Txt v="small">{T.tplHelp}</Txt>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {(Object.keys(TOKS) as TokKey[]).map((k) => (
              <PressScale key={k} kind="chip" accessibilityRole="button" accessibilityLabel={T.tok[k]} onPress={() => insertTok(k)} testID={`tok-${k}`}
                style={{ minHeight: size.target, paddingHorizontal: space[3], borderRadius: radius.pill, borderWidth: 1, borderColor: k === 'link' ? c.okBar : c.fieldLine,
                  backgroundColor: k === 'link' ? c.okBg : c.card, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Txt v="label" script="lat" style={{ fontFamily: fonts.sansBold }}>+</Txt>
                <Txt v="label">{T.tok[k]}</Txt>
              </PressScale>
            ))}
          </View>
          <Txt v="label" tone="muted" style={{ marginTop: 6 }}>{T.prevH(sample.name)}</Txt>
          <Paper testID="tpl-prev">{msg}</Paper>
        </Group>
        {rulesOn ? (
          <Group title={T.rulesH} preview={T.rulesPv(deadline, form.allow)} open={folds.isOpen('rules')} onToggle={() => folds.toggle('rules')} testID="rules">
            <View style={{ gap: 2 }}>
              <Txt v="label" tone="muted">{T.replyBy}</Txt>
              <Txt v="body">{ev.rsvp_deadline ? `${fmtDate(ev.rsvp_deadline, lang)} · ${fmtTime(ev.rsvp_deadline, lang)}` : '—'}</Txt>
            </View>
            {sw(form.allow, (v) => set('allow', v), T.canChange, 'r-change')}
            {sw(form.linkOn, (v) => set('linkOn', v), T.linkOpen, 'r-link')}
          </Group>
        ) : null}

        {/* the group link: secondary, clearly labelled, folded away */}
        {link ? (
          <Group title={T.pubH} preview={T.pubSum} open={folds.isOpen('pub')} onToggle={() => folds.toggle('pub')} testID="pub">
            <Txt v="small" tone="ink">{T.pubP}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 52, paddingVertical: 4, paddingHorizontal: 6, borderRadius: radius.pill, backgroundColor: c.surface, borderWidth: 1, borderColor: c.line }}>
              <View style={{ width: 6 }} />
              <Icon name="link" sm color={c.muted} />
              <Txt v="small" tone="ink" numberOfLines={1} script="lat" style={{ flex: 1, writingDirection: 'ltr' }}>{link.replace(/^https?:\/\//, '')}</Txt>
              <Button small kind="secondary" icon={copied ? 'check' : 'copy'} label={copied ? T.copiedB : T.copy} onPress={copy} testID="copy-link"
                style={copied ? { backgroundColor: c.okBg, borderRadius: 999 } : undefined} />
            </View>
            <Button block kind="secondary" icon="whatsapp" label={T.shareWa} onPress={() => shareWhatsApp(shareMsg)} testID="share-wa" />
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: folds.isOpen('msg') }} onPress={() => folds.toggle('msg')} testID="see-msg"
              style={{ minHeight: size.target, flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              <Txt v="label" tone="ink">{T.seeMsg}</Txt>
              <View style={{ transform: [{ rotate: folds.isOpen('msg') ? (rtl ? '-90deg' : '90deg') : '0deg' }] }}><Icon name="chev" sm color={c.ink} /></View>
            </Pressable>
            {folds.isOpen('msg') ? <Paper>{shareMsg}</Paper> : null}
          </Group>
        ) : null}

        {lim != null ? (
          <Panel flat testID="pkg" gap={2}>
            <Txt v="label" tone="muted">{T.pkgK}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <Txt v="button" tone={low ? 'no' : 'ink'}>{T.pkgLeft(left, lim)}</Txt>
              <Txt v="small">{T.pkgUsed(used)}</Txt>
            </View>
            <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: c.surface, marginTop: 10, overflow: 'hidden' }}>
              <View style={{ height: 6, borderRadius: radius.pill, backgroundColor: low ? c.noMark : c.okMark, width: `${lim ? Math.min(100, (used / lim) * 100) : 100}%` }} />
            </View>
            {low && wa.length >= 8 ? <Button small kind="quiet" icon="whatsapp" label={T.pkgMore} onPress={() => Linking.openURL(`https://wa.me/${wa}`).catch(() => {})} /> : null}
          </Panel>
        ) : null}

        {h.v2 && !h.mySide ? (
          <Group title={T.activity} preview={T.activityP} open={folds.isOpen('log')} testID="log"
            onToggle={() => { if (!folds.isOpen('log')) loadLog(); folds.toggle('log'); }}>
            <ActivityRows log={log} />
          </Group>
        ) : null}
      </Screen>

      <Sheet visible={!!chg} onClose={() => setChg(null)} title={T.chgH} closeLabel={T.close} testID="chg-sheet">
        <Txt v="body">{chg ? T.chgP(chg.length) : ''}</Txt>
        <Button big block kind="primary" icon="whatsapp" label={chg ? T.chgGo(chg.length) : ''} testID="chg-go"
          onPress={() => { const ids = chg || []; setChg(null); h.startQueue('update', ids); }} />
        <Button block kind="quiet" label={T.chgLater} onPress={() => setChg(null)} testID="chg-later" />
      </Sheet>
    </View>
  );
}

/** The activity log (host.html loadLog): what happened, to whom, how many, and the answer. */
function ActivityRows({ log }: { log: AuditRow[] | null | 'err' }) {
  const { t, c, lang } = useApp();
  const T = t.host;
  const h = useHost();
  if (log === null) return <Txt v="small">…</Txt>;
  if (log === 'err') return <Txt v="body" tone="muted">{T.logErr}</Txt>;
  if (!log.length) return <Txt v="body" tone="muted">{T.logNothing}</Txt>;
  const name = (gid: string) => h.guests.find((x) => x.id === gid)?.name || '';
  const tone = (s: string) => (({ yes: 'ok', approved: 'ok', no: 'no', rejected: 'no', pending: 'wait' } as const)[s as 'yes'] || 'mute');
  // people let in are green; people taken off at the door (an undone check-in) are amber; a request's count is green only once let in
  const pTone = (a: AuditRow) => (a.action === 'undo_check_in' ? 'wait' : a.action === 'request_exception' || (a.details || {}).approved === false ? 'mute' : 'ok');
  const st = (d: Record<string, unknown>) => String(d.status || (d.approved === true ? 'approved' : d.approved === false ? 'rejected' : ''));
  const who = (d: Record<string, unknown>) => {
    if (d.guest) return name(String(d.guest));
    const r = d.request ? h.reqs.find((x) => x.id === d.request) : null;
    return r ? h.reqName(r) || T.notOnList : '';
  };
  const many = (d: Record<string, unknown>) => Number(d.people || (d.request ? h.reqs.find((x) => x.id === d.request)?.people : 0) || 0);
  const ACT = T.act as Record<string, string>;
  const LS = T.logSt as Record<string, string>;
  return (
    <View testID="log-rows">
      {log.map((a, i) => {
        const d = (a.details || {}) as Record<string, unknown>, nm = who(d), nn = many(d), s2 = st(d);
        return (
          <View key={a.id ?? i} style={{ paddingVertical: 10, borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: 2 }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 }}>
              <Txt v="button">{ACT[a.action] || T.actOther}</Txt>
              {nm ? <Txt v="body">{nm}</Txt> : null}
              {nn ? <Tag tone={pTone(a)} label={h.cw(nn)} /> : null}
              {s2 ? <Tag tone={tone(s2)} label={LS[s2] || s2} /> : null}
            </View>
            <Meta bits={[`${fmtDate(a.created_at, lang)} ${fmtTime(a.created_at, lang)}`, a.actor ? <Txt key="a" v="small" script="lat" style={{ writingDirection: 'ltr' }}>{a.actor}</Txt> : T.logGuest]} />
          </View>
        );
      })}
    </View>
  );
}


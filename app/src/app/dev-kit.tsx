// The UI kit on one page, for building and checking screens (open /dev-kit).
// Only in builds made with EXPO_PUBLIC_KIT=1 (the test rig); everyone else is sent home.
import { Redirect } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  AlertBar, Button, ChipRow, Field, FilterChip, Icon, IconButton, Kicker, MeterBar, Panel, Row, RowList, Screen, Segmented, Sheet,
  Stepper, Tag, Txt, UndoBand, useToast, useUndoBand, EmptyState, ArchMark, Dot,
} from '../components';
import { ICONS, type IconName } from '../components/icons';
import { countWord } from '../lib/words';
import { useApp } from '../providers/AppProvider';
import { swatch, type ThemePref } from '../theme/tokens';

export default function DevKit() {
  const { t, lang, setLang, themePref, setThemePref } = useApp();
  const [n, setN] = useState(2);
  const [f, setF] = useState<'all' | 'yes' | 'pending' | 'no'>('all');
  const [sheet, setSheet] = useState(false);
  const toast = useToast();
  const band = useUndoBand();
  if (process.env.EXPO_PUBLIC_KIT !== '1') return <Redirect href="/" />;
  const K = t.host.K;
  return (
    <Screen edges={['top', 'left', 'right', 'bottom']} testID="dev-kit">
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <ArchMark />
        <Txt v="title" style={{ flex: 1 }}>{t.appName}</Txt>
        <Button small label={t.menu.other} onPress={() => setLang(lang === 'ar' ? 'en' : 'ar')} />
      </View>
      <Segmented<ThemePref> label={t.menu.colours} value={themePref} onChange={setThemePref}
        options={(['cream', 'light', 'dark'] as const).map((k) => ({ key: k, label: t.menu.theme[k], swatch: swatch[k] }))} />
      <AlertBar count={2} text={t.host.reqBar(2)} go={t.host.reqGo} onPress={() => toast(t.host.reqGo)} />
      <Panel>
        <Kicker>{t.host.nextK}</Kicker>
        <Txt v="num">36</Txt>
        <Txt v="name">{t.host.hero(36).w}</Txt>
        <Txt v="small">{t.host.heroOf(48, 20)}</Txt>
        <MeterBar total={48} parts={[{ tone: 'ok', value: 36 }, { tone: 'wait', value: 8 }, { tone: 'no', value: 4 }]} />
        <Button big block kind="primary" icon="whatsapp" label={t.host.nSendB(3)} onPress={() => toast(t.host.saved)} />
        <Button block kind="secondary" icon="bell" label={t.host.nRemB(4)} onPress={() => band({ text: t.door.band('Dana Test', 2), sub: t.door.bandLeft(1), onUndo: () => toast(t.door.undone('Dana Test')) })} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Button small kind="quiet" label={t.host.remind} icon="bell" onPress={() => {}} />
          <Button small kind="danger" label={t.host.remove} icon="trash" onPress={() => {}} />
          <Button small kind="refuse" label={t.host.turnDown} onPress={() => {}} />
          <Button small busy label={t.door.busy} onPress={() => {}} />
        </View>
      </Panel>
      <ChipRow scroll>
        {(['all', 'yes', 'pending', 'no'] as const).map((k) => (
          <FilterChip key={k} label={K[k]} count={k === 'all' ? 20 : 5} tone={k === 'yes' ? 'ok' : k === 'pending' ? 'wait' : k === 'no' ? 'no' : undefined} selected={f === k} onPress={() => setF(k)} />
        ))}
      </ChipRow>
      <Field label={t.host.name} placeholder={t.door.searchPh} search />
      <Field label={t.host.waNum} placeholder="5000 0001" ltr keyboardType="phone-pad" help={t.host.partyHelp} />
      <RowList>
        <Row title="غلا العتيبي" sub={countWord(3, 'person', lang)} start={<Dot tone="ok" />} end={<Tag tone="ok" label={K.yes} />} chevron onPress={() => setSheet(true)} />
        <Row title="Dana Test" sub={t.host.notSent} start={<Dot tone="wait" />} end={<Tag tone="wait" label={K.pending} />} chevron onPress={() => setSheet(true)} />
        <Row title="Mariam Alsabah" sub={t.host.ctxNo} start={<Dot tone="no" />} end={<Tag tone="no" label={K.no} />} />
      </RowList>
      <Panel tone="wait"><Txt v="label" tone="wait">{t.door.alreadyK(2)}</Txt><Txt v="name">Dana Test</Txt><Txt v="small">{t.door.already(2, '9:33 PM')}</Txt></Panel>
      <Stepper value={n} max={6} onChange={setN} label={t.door.howMany} lessLabel={t.door.less} moreLabel={t.door.more} />
      <UndoBand text={t.door.band('Huda', 1)} undoLabel={t.menu.undo} onUndo={() => {}} />
      <UndoBand tone="no" text={t.host.turnedDown('Huda')} undoLabel={t.menu.undo} onUndo={() => {}} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
        {(Object.keys(ICONS) as IconName[]).map((k) => <Icon key={k} name={k} />)}
        <IconButton icon="menu" label={t.menu.menu} dot onPress={() => {}} />
      </View>
      <EmptyState title={t.host.noEvH} body={t.host.noEvP} />
      <Sheet visible={sheet} onClose={() => setSheet(false)} title={t.menu.menu}
        footer={<Button block kind="primary" label={t.host.save} onPress={() => { toast(t.host.saved); }} />}>
        <Txt>{t.menu.helpItems[0][1]}</Txt>
        <Stepper value={n} max={6} onChange={setN} label={t.door.howMany} lessLabel={t.door.less} moreLabel={t.door.more} />
      </Sheet>
    </Screen>
  );
}

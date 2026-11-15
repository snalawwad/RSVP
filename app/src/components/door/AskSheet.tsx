// "Ask the hosts" sheet (door.html #ask): a guest on the list (name + allowed line) or a name typed in,
// how many people (1–6, 7+ with a stepper up to 20), a reason chip, an optional note, and one Send button.
import { useEffect, useRef, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import { useApp } from '../../providers/AppProvider';
import { radius, space } from '../../theme/tokens';
import { Button } from '../Button';
import { ChipRow, FilterChip } from '../Chip';
import { Field } from '../Field';
import { Sheet } from '../Sheet';
import { Txt } from '../Txt';
import { MAX_ASK } from './logic';
import { LtrStepper, PeopleChips } from './parts';

export type AskState = { guest: string | null; name: string; people: number; reason: number | null; note: string };

export function AskSheet({ ask, onChange, onClose, onSend, sending, allowedLine }: {
  ask: AskState | null; onChange: (a: AskState) => void; onClose: () => void; onSend: () => void; sending: boolean;
  /** "Allowed 3 people · 1 person in" for a guest on the list */
  allowedLine: string | null;
}) {
  const { t, c } = useApp();
  const T = t.door;
  const nameRef = useRef<ComponentRef<typeof TextInput>>(null);
  const open = !!ask;
  const wantFocus = open && !ask?.guest && !ask?.name;
  useEffect(() => {
    if (!wantFocus) return;
    const k = setTimeout(() => nameRef.current?.focus(), 250);
    return () => clearTimeout(k);
  }, [wantFocus]);
  const a = ask ?? { guest: null, name: '', people: 1, reason: null, note: '' };
  const set = (p: Partial<AskState>) => onChange({ ...a, ...p });
  const setPeople = (n: number) => set({ people: Math.max(1, Math.min(MAX_ASK, n)) });
  return (
    <Sheet visible={open} onClose={onClose} title={T.askH} closeLabel={T.close} testID="ask-sheet"
      footer={<Button kind="primary" big block icon="bell" label={T.send(a.people)} onPress={onSend} busy={sending} testID="ask-send" />}>
      {a.guest ? (
        <View style={{ gap: 2, paddingVertical: 12, paddingHorizontal: 14, borderRadius: radius.m, backgroundColor: c.surface, marginTop: 4 }} testID="ask-who">
          <Txt v="name">{a.name}</Txt>
          {allowedLine ? <Txt v="small">{allowedLine}</Txt> : null}
        </View>
      ) : (
        <Field ref={nameRef} label={T.name} value={a.name} onChangeText={(v) => set({ name: v })} maxLength={120} autoComplete="off" autoCorrect={false} testID="ask-name" />
      )}
      <View style={{ gap: space[2], marginTop: space[2] }}>
        <Txt v="label" tone="muted">{T.count}</Txt>
        <PeopleChips value={a.people} onPick={setPeople} onBig={() => { if (a.people <= 6) setPeople(7); }} bigLabel={T.bigN} label={T.count} />
        {a.people > 6 ? (
          <View style={{ marginTop: 2 }} testID="ask-big">
            <LtrStepper value={a.people} min={7} max={MAX_ASK} onChange={setPeople} label={T.count} lessLabel={T.less} moreLabel={T.more} />
          </View>
        ) : null}
      </View>
      <View style={{ gap: space[2], marginTop: space[2] }}>
        <Txt v="label" tone="muted">{T.reasonL}</Txt>
        <ChipRow>
          {T.reasons.map((r, i) => (
            <FilterChip key={i} label={r} selected={a.reason === i} onPress={() => set({ reason: a.reason === i ? null : i })} testID={`ask-reason-${i}`} />
          ))}
        </ChipRow>
      </View>
      <View style={{ marginTop: space[2] }}>
        <Field label={T.otherNote} value={a.note} onChangeText={(v) => set({ note: v })} maxLength={400} autoComplete="off" testID="ask-note" />
      </View>
    </Sheet>
  );
}

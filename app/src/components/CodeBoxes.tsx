// The 6-digit code (Figma 03 / 03a / 03b / 03c): six boxes over one real text field, so the phone's
// "From Messages" code suggestion, paste and the number pad all work. Wrong code: the boxes turn pink.
import { forwardRef, useImperativeHandle, useRef, useState, type ComponentRef } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import { asciiDigits } from '../lib/names';
import { useApp } from '../providers/AppProvider';
import { alpha, fonts, radius } from '../theme/tokens';
import { Txt } from './Txt';

export type CodeBoxesRef = { focus: () => void };

export const CodeBoxes = forwardRef<CodeBoxesRef, { value: string; onChange: (v: string) => void; bad?: boolean; onDone?: () => void; label: string; testID?: string }>(
  function CodeBoxes({ value, onChange, bad, onDone, label, testID }, ref) {
    const { c } = useApp();
    const input = useRef<ComponentRef<typeof TextInput>>(null);
    const [focus, setFocus] = useState(false);
    useImperativeHandle(ref, () => ({ focus: () => input.current?.focus() }), []);
    const digits = value.split('');
    const at = Math.min(value.length, 5);
    return (
      <Pressable onPress={() => input.current?.focus()} accessible={false} style={{ position: 'relative' }}>
        <View style={{ flexDirection: 'row', gap: 8, direction: 'ltr' }} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
          {[0, 1, 2, 3, 4, 5].map((i) => {
            const on = focus && i === at && !bad;
            return (
              <View key={i} style={{
                flex: 1, maxWidth: 56, height: 56, borderRadius: radius.m, alignItems: 'center', justifyContent: 'center',
                borderWidth: on ? 2 : 1, borderColor: bad ? c.noMark : on ? c.plum : c.fieldLine, backgroundColor: bad ? c.noBg : c.card,
                boxShadow: on ? `0px 0px 0px 3px ${alpha(c.plum, 0.18)}` : undefined,
              }}>
                <Txt v="title" script="lat" style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 30 }}>{digits[i] ?? ''}</Txt>
              </View>
            );
          })}
        </View>
        <TextInput
          ref={input} testID={testID} value={value} accessibilityLabel={label}
          onChangeText={(v) => { const d = asciiDigits(v).replace(/\D/g, '').slice(0, 6); onChange(d); if (d.length === 6) onDone?.(); }}
          onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
          keyboardType="number-pad" inputMode="numeric" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} caretHidden
          style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, opacity: 0.011, color: 'transparent', fontSize: 16 }}
        />
      </Pressable>
    );
  });

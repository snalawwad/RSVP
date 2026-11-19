// Text fields (web inputs): card background, field-line border, 12 radius, 48 tall; plum border + ring on focus.
import { forwardRef, useState, type ComponentRef } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { textStart } from '../theme/dir';
import { alpha, radius, scriptOf, size, space, textStyle } from '../theme/tokens';
import { Icon } from './Icon';
import { Txt } from './Txt';

export type FieldProps = TextInputProps & {
  /** label above (14 semibold muted) */
  label?: string;
  /** help under it (14 muted) */
  help?: string;
  /** an error under it (red) */
  error?: string;
  /** left-to-right content (email, phone, numbers) even in Arabic */
  ltr?: boolean;
  /** search icon at the start */
  search?: boolean;
};

export const Field = forwardRef<ComponentRef<typeof TextInput>, FieldProps>(function Field({ label, help, error, ltr, search, style, onFocus, onBlur, value, ...input }, ref) {
  const { c, rtl, lang } = useApp();
  const [focus, setFocus] = useState(false);
  const sc = value ? scriptOf(value) : lang === 'ar' ? 'ar' : 'lat';
  return (
    <View style={{ gap: 6 }}>
      {label ? <Txt v="label" tone="muted">{label}</Txt> : null}
      <View style={{ borderRadius: radius.m + 3, borderWidth: 3, borderColor: focus ? alpha(c.plum, 0.25) : 'transparent', margin: -3 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: size.button, borderRadius: radius.m, borderWidth: 1, borderColor: focus ? c.plum : error ? c.noMark : c.fieldLine, backgroundColor: c.card }}>
          {search ? <View style={{ paddingHorizontal: 14 }}><Icon name="search" color={c.muted} /></View> : null}
          <TextInput
            ref={ref}
            placeholderTextColor={c.muted}
            selectionColor={c.plum}
            value={value}
            accessibilityLabel={label}
            {...input}
            onFocus={(e) => { setFocus(true); onFocus?.(e); }}
            onBlur={(e) => { setFocus(false); onBlur?.(e); }}
            style={[textStyle('body', sc), {
              flex: 1, minHeight: size.button, color: c.ink, paddingHorizontal: space[3] + 2, paddingVertical: space[2],
              textAlign: textStart(rtl),   // web: [dir=rtl] input[dir=ltr] stays right-aligned writingDirection: ltr ? 'ltr' : rtl ? 'rtl' : 'ltr',
              outlineStyle: 'none',
            } as object, style]}
          />
        </View>
      </View>
      {error ? <Txt v="small" tone="no">{error}</Txt> : help ? <Txt v="small">{help}</Txt> : null}
    </View>
  );
});

// The red door-alert bar (web .alertbar): one tap goes to the door's requests. Filled red, 56 tall.
import { View } from 'react-native';
import { useApp } from '../providers/AppProvider';
import { fonts, radius, size, space } from '../theme/tokens';
import { Icon, type IconName } from './Icon';
import { PressScale } from './Press';
import { Txt } from './Txt';

export function AlertBar({ count, text, go, onPress, icon = 'door', testID }: {
  /** the number in the white badge (optional) */
  count?: number; text: string; /** the action word at the end, e.g. t.host.reqGo */ go?: string; onPress: () => void; icon?: IconName; testID?: string;
}) {
  const { c, rtl } = useApp();
  return (
    <PressScale testID={testID ?? 'alertbar'} accessibilityRole="button" accessibilityLabel={[text, go].filter(Boolean).join('. ')} onPress={onPress} wrapStyle={{ alignSelf: 'stretch' }}
      style={({ pressed }) => ({ minHeight: size.alertBar, borderRadius: radius.m, backgroundColor: pressed ? '#9C2119' : c.alert, paddingHorizontal: space[4], paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: space[3] })}>
      {count != null ? (
        <View style={{ minWidth: 28, height: 28, paddingHorizontal: 6, borderRadius: 14, backgroundColor: c.alertInk, alignItems: 'center', justifyContent: 'center' }}>
          <Txt v="tab" color={c.alert} script="lat" center style={{ fontFamily: fonts.sansBold }}>{count}</Txt>
        </View>
      ) : <Icon name={icon} color={c.alertInk} />}
      <View style={{ flex: 1, minWidth: 0 }}><Txt v="button" color={c.alertInk}>{text}</Txt></View>
      {go ? <Txt v="tab" color={c.alertInk}>{go + (rtl ? ' ‹' : ' ›')}</Txt> : null}
    </PressScale>
  );
}

// The app's bottom bar (Sama's Figma 24g / 24e / 24q, 22 Nov evening): Home · Create event · Support.
// Updates (bell, with a dot for new replies) and Account (person) sit as round icons at the top of Home and Support.
import { router } from 'expo-router';
import { View } from 'react-native';
import { useUnreadUpdates } from '../lib/updates';
import { useApp } from '../providers/AppProvider';
import { radius } from '../theme/tokens';
import { Icon } from './Icon';
import { PressScale } from './Press';
import { TabBarFrame, TabButton } from './TabBar';

export type MainTab = 'home' | 'create' | 'support';

/** active = the screen it sits on; onEvent = it sits on an event's page (Home is then "back to your events"). */
export function MainTabBar({ active, onEvent = false }: { active: MainTab; onEvent?: boolean }) {
  const { t } = useApp();
  const go = (k: MainTab) => {
    if (k === active && !onEvent) return;
    if (k === 'home') { router.dismissTo('/'); return; }
    if (k === 'create') { router.push('/new-event' as never); return; }
    if (active === 'home' && !onEvent) router.push('/support' as never); else router.replace('/support' as never);
  };
  const tabs: { k: MainTab; icon: 'home' | 'plus' | 'help'; label: string }[] = [
    { k: 'home', icon: 'home', label: t.a.tabHome }, { k: 'create', icon: 'plus', label: t.a.tabCreate }, { k: 'support', icon: 'help', label: t.a.tabSupport },
  ];
  return (
    <TabBarFrame testID="main-tabs">
      {tabs.map((x) => (
        <TabButton key={x.k} icon={x.icon} label={x.label} isFocused={x.k === active} onPress={() => go(x.k)} testID={`main-tab-${x.k}`} />
      ))}
    </TabBarFrame>
  );
}

/** Top-right icons (Figma 24g): Updates (bell, plum dot when there are new replies) and Account. */
export function TopIcons() {
  const { t, c, email } = useApp();
  const n = useUnreadUpdates(email);
  const btn = (icon: 'bell' | 'person', label: string, path: string, dot: boolean, testID: string) => (
    <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={dot ? `${label} (${n})` : label} hitSlop={4} onPress={() => router.push(path as never)} testID={testID}
      style={{ width: 36, height: 36, borderRadius: radius.pill, backgroundColor: c.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} sm color={c.ink} />
      {dot ? <View style={{ position: 'absolute', top: 6, right: 7, width: 8, height: 8, borderRadius: 4, backgroundColor: c.plum, borderWidth: 1.5, borderColor: c.surface }} /> : null}
    </PressScale>
  );
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {btn('bell', t.a.tabUpdates, '/updates', n > 0, 'top-updates')}
      {btn('person', t.a.account, '/settings', false, 'top-account')}
    </View>
  );
}

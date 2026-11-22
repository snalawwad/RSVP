// The app's bottom bar (Sama's Figma 24g / 24e / 24o / 24b): Home · Updates · Account, on the home screens and an
// event's page. Updates carries a small plum count of new replies.
import { router } from 'expo-router';
import { useUnreadUpdates } from '../lib/updates';
import { useApp } from '../providers/AppProvider';
import { TabBarFrame, TabButton } from './TabBar';

export type MainTab = 'home' | 'updates' | 'account';
const PATH = { updates: '/updates', account: '/settings' } as const;

/** active = the screen it sits on; onEvent = it sits on an event's page (Home is then "back to your events"). */
export function MainTabBar({ active, onEvent = false }: { active: MainTab; onEvent?: boolean }) {
  const { t, email } = useApp();
  const n = useUnreadUpdates(email);
  const go = (k: MainTab) => {
    if (k === active && !onEvent) return;
    if (k === 'home') { router.dismissTo('/'); return; }
    if (active === 'home') router.push(PATH[k] as never); else router.replace(PATH[k] as never);
  };
  const tabs: { k: MainTab; icon: 'home' | 'bell' | 'person'; label: string }[] = [
    { k: 'home', icon: 'home', label: t.a.tabHome }, { k: 'updates', icon: 'bell', label: t.a.tabUpdates }, { k: 'account', icon: 'person', label: t.a.account },
  ];
  return (
    <TabBarFrame testID="main-tabs">
      {tabs.map((x) => (
        <TabButton key={x.k} icon={x.icon} label={x.label} isFocused={x.k === active} badge={x.k === 'updates' ? n : 0}
          onPress={() => go(x.k)} testID={`main-tab-${x.k}`} />
      ))}
    </TabBarFrame>
  );
}

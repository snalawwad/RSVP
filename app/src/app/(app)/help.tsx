// Help (core.js openHelp): questions and answers in plain words. Hosts get the host page's help and the door's
// (they open door mode too); door staff get the door's. Then the general Menu help, support and privacy.
import { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { Busy, Button, Kicker, Screen, Txt } from '../../components';
import { isAdmin, lc, listMembers } from '../../lib/api';
import { links } from '../../lib/config';
import { useApp } from '../../providers/AppProvider';
import { space } from '../../theme/tokens';

type Who = 'host' | 'door' | 'none';

function Items({ items, testID }: { items: readonly (readonly string[])[]; testID?: string }) {
  const { c } = useApp();
  return (
    <View testID={testID}>
      {items.map(([q, a], i) => (
        <View key={q} style={{ paddingVertical: space[3], borderTopWidth: i ? 1 : 0, borderTopColor: c.line, gap: space[1] }}>
          <Txt v="name" accessibilityRole="header">{q}</Txt>
          <Txt v="body" tone="muted">{a}</Txt>
        </View>
      ))}
    </View>
  );
}

export default function Help() {
  const { t, lang, email } = useApp();
  const [who, setWho] = useState<Who | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [admin, mem] = await Promise.all([isAdmin(), listMembers()]);
      const mine = (mem.data ?? []).filter((m) => lc(m.email) === email);
      const w: Who = admin || mine.some((m) => m.role === 'host') ? 'host' : mine.length ? 'door' : 'none';
      if (alive) setWho(w);
    })();
    return () => { alive = false; };
  }, [email]);

  if (!who) return <Screen><Busy /></Screen>;
  return (
    <Screen gap={space[4]} testID="help">
      {who === 'host' ? <Items items={t.host.help} testID="help-host" /> : null}
      {who !== 'none' ? (
        <View style={{ gap: space[1] }}>
          {who === 'host' ? <Kicker>{t.host.doorH}</Kicker> : null}
          <Items items={t.door.help} testID="help-door" />
        </View>
      ) : null}
      <View style={{ gap: space[1] }}>
        {who !== 'none' ? <Kicker>{t.menu.menu}</Kicker> : null}
        <Items items={t.menu.helpItems} testID="help-menu" />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2], marginTop: space[2] }}>
        <Button label={t.support} kind="secondary" small onPress={() => Linking.openURL(links.support(lang))} testID="help-support" />
        <Button label={t.privacy} kind="secondary" small onPress={() => Linking.openURL(links.privacy(lang))} testID="help-privacy" />
      </View>
    </Screen>
  );
}

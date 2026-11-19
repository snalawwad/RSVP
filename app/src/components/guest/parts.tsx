// Pieces of the guest screens (Figma G11–G13): a detail row with an icon and an end link, the invite card,
// and the "loading / not found / not ready" states.
import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import { useApp } from '../../providers/AppProvider';
import { fonts, radius, scriptOf, size, space } from '../../theme/tokens';
import { Busy, EmptyState } from '../Misc';
import { ArchMark, Icon, type IconName } from '../Icon';
import { PressScale } from '../Press';
import { Txt } from '../Txt';
import type { InviteState } from './useInvite';
import type { InviteView } from '../../lib/types7';

/** A detail line: icon, words (and a muted line under them), and an optional link at the end. */
export function InfoRow({ icon, title, sub, end, onEnd, endTone = 'plum', testID, top, onPress }: {
  icon: IconName; title: ReactNode; sub?: string; end?: string; onEnd?: () => void; endTone?: 'plum' | 'ok'; testID?: string; top?: boolean;
  /** the whole row opens something (a chevron at the end) */
  onPress?: () => void;
}) {
  const { c } = useApp();
  if (onPress) {
    return (
      <PressScale kind="chip" testID={testID} accessibilityRole="button" accessibilityLabel={typeof title === 'string' ? title : undefined} onPress={onPress}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 60, paddingVertical: space[2], borderTopWidth: top ? 1 : 0, borderBottomWidth: 1, borderColor: c.line }}>
        <Icon name={icon} color={c.muted} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {typeof title === 'string' ? <Txt v="body">{title}</Txt> : title}
          {sub ? <Txt v="small">{sub}</Txt> : null}
        </View>
        {end ? <Txt v="small">{end}</Txt> : null}
        <Icon name="chev" sm color={c.muted} />
      </PressScale>
    );
  }
  return (
    <View testID={testID} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 60, paddingVertical: space[2], borderTopWidth: top ? 1 : 0, borderBottomWidth: 1, borderColor: c.line }}>
      <Icon name={icon} color={c.muted} />
      <View style={{ flex: 1, minWidth: 0 }}>
        {typeof title === 'string' ? <Txt v="body">{title}</Txt> : title}
        {sub ? <Txt v="small">{sub}</Txt> : null}
      </View>
      {end ? (
        onEnd ? (
          <PressScale kind="chip" accessibilityRole="button" accessibilityLabel={end} onPress={onEnd} hitSlop={6} testID={testID ? `${testID}-go` : undefined}
            style={{ minHeight: size.target, justifyContent: 'center', paddingHorizontal: space[1] }}>
            <Txt v="label" tone={endTone}>{end}</Txt>
          </PressScale>
        ) : <Txt v="label" tone={endTone}>{end}</Txt>
      ) : null}
    </View>
  );
}

/** The invitation itself: the host's card image when there is one, else the words set in type under the arch. */
export function InviteCard({ inv }: { inv: InviteView }) {
  const { c } = useApp();
  const e = inv.event;
  const name = e.headline || e.title;
  if (e.card_image_url) {
    return (
      <View style={{ borderRadius: radius.l, overflow: 'hidden', borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
        <Image source={{ uri: e.card_image_url }} accessibilityLabel={name} resizeMode="contain" style={{ width: '100%', aspectRatio: 0.72 }} />
      </View>
    );
  }
  const ar = scriptOf(name) === 'ar';
  return (
    <View testID="invite-card" style={{ alignItems: 'center', gap: space[2], paddingVertical: space[8], paddingHorizontal: space[5], borderRadius: radius.l, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
      <ArchMark size={26} />
      {e.invite_line ? <Txt v="small" center>{e.invite_line}</Txt> : null}
      <Txt v="title" center style={{ fontFamily: ar ? fonts.arDisplayBold : fonts.display, fontSize: ar ? 30 : 34, lineHeight: ar ? 50 : 38 }}>{name}</Txt>
      {e.note ? <Txt v="small" center>{e.note}</Txt> : null}
    </View>
  );
}

/** Loading, not found, not ready yet, or couldn't load. */
export function InviteGate({ st, onRetry }: { st: InviteState; onRetry: () => void }) {
  const { t } = useApp();
  if (st.kind === 'loading') return <Busy />;
  if (st.kind === 'gone') return <EmptyState title={t.a.gone} testID="inv-gone" />;
  if (st.kind === 'not_ready') return <EmptyState title={t.a.notReady} testID="inv-not-ready" />;
  if (st.kind === 'error') return <EmptyState title={t.couldNotLoad} action={<PressScale kind="chip" accessibilityRole="button" onPress={onRetry} style={{ minHeight: size.target, alignSelf: 'center', justifyContent: 'center' }}><Txt v="label" tone="plum">{t.a.retry}</Txt></PressScale>} />;
  return null;
}

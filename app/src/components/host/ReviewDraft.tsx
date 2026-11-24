// Review the new version (Sama's Figma 24p): the draft our team sent for a change or a design, what the host asked
// for, "Approve", and "Not right? Tell our team and we’ll fix it." (WhatsApp, else Support).
//  - A change (kind 'change'): approve_change_v2. Free: it was paid for when it was asked for.
//  - A design (kind 'design'): approved here ONLY when the event's package includes design (approve_design_v2 then
//    makes a free order that is already paid). Otherwise the draft shows with "Ask our team" and no Approve: the app
//    never takes a payment or points to the website to pay (Apple; owner's decision). No price anywhere.
//  - A host who only sees one side can look but not approve (the database allows only the main host).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Linking, Pressable, View } from 'react-native';
import { approveChange, approveIncludedDesign, listPackages, needsReview } from '../../lib/api7';
import { why } from '../../lib/api';
import { links } from '../../lib/config';
import { haptics } from '../../lib/haptics';
import { useApp } from '../../providers/AppProvider';
import { radius, space } from '../../theme/tokens';
import { PageTitle } from '../Brand';
import { Button } from '../Button';
import { useToast } from '../Feedback';
import { ListLine } from '../ListLine';
import { Busy } from '../Misc';
import { Screen } from '../Screen';
import { Txt } from '../Txt';
import { useHost } from './HostContext';

/** A link that is a picture (an uploaded card), not a page. */
const looksLikeImage = (u: string) => /\.(png|jpe?g|webp|gif|heic|avif)(\?|#|$)/i.test(u) || /\/storage\/v1\/object\/public\//.test(u);
const clip = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1).trim() + '…' : s);

export function ReviewDraft() {
  const { rid } = useLocalSearchParams<{ rid: string }>();
  const { t, c } = useApp();
  const A = t.a;
  const h = useHost();
  const toast = useToast();
  const [designFree, setDesignFree] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const r = (h.asks ?? []).find((x) => x.id === String(rid)) ?? null;
  const isDesign = r?.kind === 'design';

  // is design part of this event's package? (read-only: the packages table; unknown = no, so nothing is ever charged)
  useEffect(() => {
    if (!isDesign) return;
    let off = false;
    listPackages().then((p) => { if (!off) setDesignFree(!!(p.data ?? []).find((x) => x.code === h.me?.package)?.design_included); });
    return () => { off = true; };
  }, [isDesign, h.me?.package]);

  const done = () => (router.canGoBack() ? router.back() : router.replace(`/event/${h.id}/invite` as never));
  const openTeam = (text: string) => {
    const wa = links.whatsapp(text);
    if (wa) Linking.openURL(wa).catch(() => router.push('/support' as never));
    else router.push('/support' as never);
  };

  if (h.asks === null) return <Screen testID="review"><Busy /></Screen>;
  if (!r || !needsReview(r)) {
    return (
      <Screen gap={space[4]} testID="review">
        <PageTitle>{A.newInvH}</PageTitle>
        <Txt v="body" tone="muted" testID="review-gone">{A.noDraft}</Txt>
        <Button block kind="secondary" label={t.back} onPress={done} />
      </Screen>
    );
  }

  const canApprove = !h.cohost && !h.mySide && (r.kind === 'change' || (isDesign && designFree === true));
  const waiting = isDesign && designFree === null;
  const asked = (r.kind === 'change' ? r.what : r.idea)?.trim() || '';
  const url = r.draft_url?.trim() || '';
  const showImg = !!url && looksLikeImage(url) && !imgFailed;

  async function approve() {
    if (!r || busy) return;
    setBusy(true);
    const res = r.kind === 'change' ? await approveChange(r.id) : await approveIncludedDesign(r.id);
    setBusy(false);
    if (res.error) { toast(/NO_DRAFT_YET/.test(res.error.message) ? A.noDraft : t.host.cantSave(why(res.error))); haptics.error(); h.loadAsks(); return; }
    haptics.success(); toast(A.approvedOk);
    await h.loadAsks();
    done();
  }

  const footer = waiting ? undefined : canApprove ? (
    <>
      <Button block kind="primary" label={A.approveB} onPress={approve} busy={busy} testID="review-approve" />
      <Pressable accessibilityRole="link" onPress={() => openTeam(A.notRightWa(h.evName))} hitSlop={8} testID="review-not-right"
        style={{ minHeight: 44, justifyContent: 'center' }}>
        <Txt v="small" tone="plum" center style={{ textDecorationLine: 'underline' }}>{A.notRight}</Txt>
      </Pressable>
    </>
  ) : (
    <Button block kind="primary" icon="whatsapp" label={A.askTeam} onPress={() => openTeam(isDesign ? A.designWa(h.evName) : A.notRightWa(h.evName))} testID="review-ask" />
  );

  return (
    <Screen gap={space[4]} testID="review" footer={footer}>
      <PageTitle sub={A.newInvP}>{A.newInvH}</PageTitle>
      {showImg ? (
        <View testID="review-draft" style={{ borderWidth: 1, borderColor: c.line, borderRadius: radius.l, overflow: 'hidden', backgroundColor: c.card }}>
          <Image source={{ uri: url }} accessibilityLabel={A.newInvH} resizeMode="contain" onError={() => setImgFailed(true)} style={{ width: '100%', aspectRatio: 0.72 }} />
        </View>
      ) : null}
      {(url && !showImg) || asked ? (
        <View style={{ borderTopWidth: 1, borderTopColor: c.line }}>
          {url && !showImg ? <ListLine label={A.openDraft} onPress={() => Linking.openURL(url).catch(() => {})} last={!asked} testID="review-open" /> : null}
          {asked ? <ListLine label={A.askedFor} value={clip(asked)} valueTone="ink" last testID="review-asked" /> : null}
        </View>
      ) : null}
      {waiting ? <Busy /> : null}
    </Screen>
  );
}

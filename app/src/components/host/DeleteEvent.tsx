// "Delete event" (Sara, 21 Nov 2026; beyond Sama's Figma). Main host or admin only (delete_event_v2, 0009).
// A sheet asks first. The event goes with its guest list, replies and check-ins; the team keeps a copy of any
// payment record. No word about payment here (Apple).
import { router } from 'expo-router';
import { useState } from 'react';
import { deleteEvent } from '../../lib/api7';
import { haptics } from '../../lib/haptics';
import { useApp } from '../../providers/AppProvider';
import { Button } from '../Button';
import { useToast } from '../Feedback';
import { Sheet } from '../Sheet';
import { Txt } from '../Txt';

export function DeleteEvent({ id, title, testID = 'ev-delete' }: { id: string; title: string; testID?: string }) {
  const { t } = useApp();
  const A = t.a;
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    const r = await deleteEvent(id);
    setBusy(false);
    if (r.error) { haptics.error(); toast(A.delErr); return; }
    haptics.success?.();
    setOpen(false);
    toast(A.delDone(title));
    router.dismissTo('/');
  }
  return (
    <>
      <Button block kind="danger" icon="trash" label={A.delBtn} onPress={() => setOpen(true)} testID={testID} />
      <Sheet visible={open} onClose={() => setOpen(false)} title={A.delH} closeLabel={t.close} testID="del-sheet"
        footer={(
          <>
            <Button big block kind="refuse" label={A.delGo} busy={busy} onPress={go} testID="del-go" />
            <Button block kind="quiet" label={A.delKeep} onPress={() => setOpen(false)} testID="del-keep" />
          </>
        )}>
        <Txt v="body">{A.delP(title)}</Txt>
      </Sheet>
    </>
  );
}

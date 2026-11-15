// Account deletion (required by Apple and Google). Shows exactly what will go, then asks the person to
// type DELETE. The delete-account Edge Function does the work server side; then we log out.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Busy, Button, Field, Panel, Row, RowList, Screen, Txt, useToast } from '../../components';
import { accountSummary, deleteAccount, signOut, type AccountSummary } from '../../lib/api';
import { fmtDate } from '../../lib/format';
import { countWordHost } from '../../lib/words';
import { useApp } from '../../providers/AppProvider';
import { space } from '../../theme/tokens';

export default function DeleteAccount() {
  const { t, lang } = useApp();
  const toast = useToast();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    accountSummary().then(({ data, error }) => {
      if (error || !data) setFailed(true);
      else setSummary(data);
    });
  }, []);

  const ready = typed.trim().toUpperCase() === 'DELETE';
  async function remove() {
    if (!ready || busy) return;
    setBusy(true); setErr('');
    const { error } = await deleteAccount();
    if (error) { setBusy(false); setErr(t.deleteFailed); return; }
    toast(t.deleteDone);
    await signOut();   // the root layout shows the login again
  }

  return (
    <Screen gap={space[4]} testID="delete">
      <Txt v="title">{t.deleteTitle}</Txt>
      <Txt v="body">{t.deleteIntro}</Txt>
      {failed ? <Panel tone="no"><Txt v="body" tone="no">{t.couldNotLoad}</Txt></Panel> : null}
      {!summary && !failed ? <Busy /> : null}

      {summary?.is_admin ? <Panel tone="no" testID="delete-admin"><Txt v="body" tone="no">{t.deleteAdmin}</Txt></Panel> : null}

      {summary && !summary.is_admin ? (
        <>
          {summary.events_to_delete.length === 0 ? (
            <Panel flat><Txt v="body" tone="muted">{t.deleteNoEvents}</Txt></Panel>
          ) : (
            <View style={{ gap: space[2] }}>
              <Txt v="body">{t.deleteEvents}</Txt>
              <RowList testID="delete-events">
                {summary.events_to_delete.map((e) => (
                  <Row key={e.id} title={e.title} sub={[e.starts_at ? fmtDate(e.starts_at, lang) : '', countWordHost(e.guests, 'guest', lang)].filter(Boolean).join(' · ')} />
                ))}
              </RowList>
            </View>
          )}
          <Field label={t.deleteTypeToConfirm} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} ltr
            error={err || undefined} onSubmitEditing={remove} testID="delete-type" />
          <Button label={t.deleteConfirm} kind="refuse" block onPress={remove} busy={busy} disabled={!ready} testID="delete-confirm" />
        </>
      ) : null}
      <Button label={t.cancel} kind="secondary" block onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))} testID="delete-cancel" />
    </Screen>
  );
}

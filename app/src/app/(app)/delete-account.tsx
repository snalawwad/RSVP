// Account deletion (required by Apple and Google). Shows exactly what will go, then asks
// the host to type DELETE. The delete-account Edge Function does the work server side.
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, View } from 'react-native';
import { Button, Card, Field, Screen, T } from '../../components/ui';
import { fmtDate } from '../../lib/format';
import { supabase, type AccountSummary } from '../../lib/supabase';
import { useApp } from '../../providers/AppProvider';
import { space } from '../../theme/tokens';

export default function DeleteAccount() {
  const { t, f, lang, c } = useApp();
  const [summary, setSummary] = useState<AccountSummary | null>(null);
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.rpc('my_account_summary').then(({ data, error }) => {
      if (error) setFailed(true);
      else setSummary(data as AccountSummary);
    });
  }, []);

  async function remove() {
    setBusy(true);
    const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
    setBusy(false);
    if (error) return Alert.alert(t.deleteFailed);
    await supabase.auth.signOut();
    Alert.alert(t.deleteDone);
  }

  return (
    <Screen>
      <T v="heading2" accessibilityRole="header">{t.deleteTitle}</T>
      <T>{t.deleteIntro}</T>
      {failed && <T color={c.no}>{t.couldNotLoad}</T>}

      {summary?.is_admin && (
        <Card><T color={c.no}>{t.deleteAdmin}</T></Card>
      )}

      {summary && !summary.is_admin && (
        <>
          <Card>
            {summary.events_to_delete.length === 0 ? (
              <T muted>{t.deleteNoEvents}</T>
            ) : (
              <>
                <T>{t.deleteEvents}</T>
                {summary.events_to_delete.map((e) => (
                  <View key={e.id} style={{ paddingVertical: space[2], borderTopWidth: 1, borderColor: c.line }}>
                    <T v="title">{e.title}</T>
                    <T v="caption" muted>
                      {[e.starts_at ? fmtDate(e.starts_at, lang) : '', f(t.deleteGuests, { n: e.guests })].filter(Boolean).join(' · ')}
                    </T>
                  </View>
                ))}
              </>
            )}
          </Card>
          <Field label={t.deleteTypeToConfirm} value={typed} onChangeText={setTyped} autoCapitalize="characters" autoCorrect={false} />
          <Button label={t.deleteConfirm} kind="danger" onPress={remove} loading={busy} disabled={typed.trim().toUpperCase() !== 'DELETE'} />
        </>
      )}
      <Button label={t.cancel} kind="outline" onPress={() => router.back()} />
    </Screen>
  );
}

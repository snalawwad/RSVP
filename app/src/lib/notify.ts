// Notifications on or off (Sama's Figma 24b, 0010 profiles.notify): when off, the dot on the bell isn't shown.
// Saved on the account (my_profile_v2 / set_notify_v2) so the app and the website agree; kept here once read so the
// bell and Account show the same thing. Unknown (before 0010, or not read yet) counts as on.
import { useEffect, useState } from 'react';
import { myProfile } from './api7';
import { supabase } from './supabase';

let value: boolean | null = null;
let asking: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** Account read the profile or changed the switch: tell the bell. */
export function setNotifyShown(on: boolean | null) { value = on; listeners.forEach((f) => f()); }

function ask() {
  if (!asking) asking = myProfile().then((r) => { if (r.data && typeof r.data.notify === 'boolean') setNotifyShown(r.data.notify); }).catch(() => {}).finally(() => { asking = null; });
  return asking;
}

supabase.auth.onAuthStateChange((e) => { if (e === 'SIGNED_OUT') setNotifyShown(null); });

/** Is the dot on the bell wanted? true until the account says otherwise. */
export function useNotifyOn() {
  const [on, setOn] = useState(value !== false);
  useEffect(() => {
    const f = () => setOn(value !== false);
    listeners.add(f);
    f();
    if (value === null) void ask();
    return () => { listeners.delete(f); };
  }, []);
  return on;
}

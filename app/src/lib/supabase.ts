import 'expo-sqlite/localStorage/install';
import { createClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { config } from './config';

// Same Supabase project as the web app. Row-level security decides what each person sees.
export const supabase = createClient(config.supabaseUrl || 'https://invalid.local', config.supabaseKey || 'missing', {
  auth: {
    storage: localStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Keep the login fresh only while the app is open.
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

// Row types live in ./types (richer, shared with ./api). Re-exported here for the first screens.
export type { AccountSummary, DoorGuest, EventRow, GuestRow } from './types';

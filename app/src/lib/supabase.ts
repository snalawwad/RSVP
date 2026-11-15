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

export type EventRow = {
  id: string;
  title: string;
  headline: string | null;
  starts_at: string | null;
  venue: string | null;
  lang: 'ar' | 'en';
  invite_limit: number | null;
  card_image_url: string | null;
};

export type GuestRow = {
  id: string;
  name: string;
  seats: number;
  status: 'pending' | 'yes' | 'no';
  checked_in_at: string | null;
  checked_in_count: number | null;
};

export type DoorGuest = { id: string; name: string; seats: number; status: GuestRow['status']; checked_in_at: string | null };

export type AccountSummary = {
  email: string;
  is_admin: boolean;
  memberships: number;
  events_to_delete: { id: string; title: string; starts_at: string | null; guests: number }[];
};

// Rows and RPC results, as the web pages read them (same Supabase project, same RLS).
// v2 columns (confirmed_count, checked_in_count, rsvp_deadline …) come from migrations/002_mvp_core.sql;
// they're optional because the app must keep working on the old schema too.

export type GuestStatus = 'pending' | 'yes' | 'no';

export type EventRow = {
  id: string;
  title: string;
  event_type?: string;
  headline: string | null;
  invite_line?: string | null;
  note?: string | null;
  starts_at: string | null;
  ends_at?: string | null;
  venue: string | null;
  map_url?: string | null;
  map_spot?: string | null;
  message_template?: string | null;
  theme_accent?: string;
  theme_paper?: string;
  card_image_url: string | null;
  lang: 'ar' | 'en';
  invite_limit: number | null;
  public_code?: string | null;
  created_at?: string;
  // v2
  rsvp_deadline?: string | null;
  allow_changes?: boolean;
  public_link_enabled?: boolean;
};

export type MemberRow = {
  id: string;
  event_id: string;
  email: string;
  role: 'host' | 'door';
  side: string | null;
  created_at?: string;
  expires_at?: string | null;
};

export type Guest = {
  id: string;
  event_id: string;
  name: string;
  phone: string | null;
  seats: number;
  side: string | null;
  token: string;
  status: GuestStatus;
  decline_reason: string | null;
  responded_at: string | null;
  sent_at: string | null;
  checked_in_at: string | null;
  checked_in_count: number | null;
  created_at: string;
  source: string;
  confirmed_count?: number | null;
};
/** legacy name */
export type GuestRow = Guest;

/** door_list_v2 row (door_list v1 has only id, name, seats, status, checked_in_at; the rest are filled in). */
export type DoorGuest = {
  id: string;
  name: string;
  phone: string | null;
  seats: number;
  status: GuestStatus;
  confirmed_count: number | null;
  checked_in_count: number;
  decline_reason: string | null;
  side: string | null;
  checked_in_at: string | null;
  /** the 4 digits on the guest's door pass (shown as SN-4821); null before supabase/migrations/0005 */
  pass_code?: string | null;
};

/** attendance_exceptions row: a door request waiting for the hosts. */
export type DoorRequest = {
  id: string;
  event_id: string;
  guest_id: string | null;
  name: string;
  people: number;
  note: string | null;
  status: 'pending' | 'approved' | 'rejected';
  requested_by: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
};

export type AuditRow = {
  id: number;
  event_id: string;
  actor: string | null;
  action: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

/** check_in_v2 answer. ok=false reasons: 'over' (with left/allowed/arrived), 'not_found'. v1 returns { ok, checked_in_at }. */
export type CheckInResult = {
  ok: boolean;
  reason?: 'over' | 'not_found' | string;
  name?: string;
  people?: number;
  arrived?: number;
  left?: number;
  allowed?: number;
  status?: GuestStatus;
  checked_in_at?: string;
  already?: boolean;
};

/** undo_check_in_v2 answer. ok=false reasons: 'too_late', 'not_yours', 'nothing', 'not_found'. */
export type UndoResult = { ok: boolean; reason?: 'too_late' | 'not_yours' | 'nothing' | 'not_found' | string; name?: string; people?: number; arrived?: number; left?: number; status?: GuestStatus };

export type AccountSummary = {
  email: string;
  is_admin: boolean;
  memberships: number;
  events_to_delete: { id: string; title: string; starts_at: string | null; guests: number }[];
};

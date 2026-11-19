// Rows from 0007_self_serve (docs/launch/SPEC.md "Database contract"): one home for hosts, co-hosts, door staff and
// guests with an account. Optional fields stay optional: the app keeps working before 0007 is installed.
import type { GuestStatus } from './types';

export type EventStatus = 'draft' | 'active' | 'done' | 'cancelled';
export type MyRole = 'host' | 'cohost' | 'door';

/** my_events_v2() item: an event this login hosts, co-hosts or works the door for. */
export type MyEvent = {
  id: string;
  title: string;
  /** the Arabic headline, when this login can read it (not part of my_events_v2) */
  headline?: string | null;
  event_type?: string | null;
  starts_at: string | null;
  ends_at?: string | null;
  venue: string | null;
  card_image_url?: string | null;
  lang?: string | null;
  public_code?: string | null;
  role: MyRole;
  status: EventStatus;
  package?: string | null;
  door_addon?: boolean;
  /** door check-in is part of this event (the package's door or the add-on) */
  door?: boolean;
  send_channel?: string | null;
  invite_limit?: number | null;
  paid_at?: string | null;
  counts?: { invited: number; invited_people?: number; yes: number; yes_people: number; no: number; no_reply: number; arrived: number } | null;
};

/** my_invites_v2() item: an invitation sent to this login's phone number. */
export type MyInvite = {
  token: string;
  status: GuestStatus;
  seats: number;
  confirmed_count: number | null;
  responded_at: string | null;
  past: boolean;
  event: { title: string; starts_at: string | null; venue: string | null; map_url?: string | null; card_image_url?: string | null; lang?: string | null };
};

export type Profile = { user_id?: string; name: string | null; phone: string | null; email: string | null; is_admin?: boolean };

/** cohost_guests_v2 row: never a phone number or a link. */
export type CohostGuest = {
  id: string; name: string; seats: number; status: GuestStatus; confirmed_count: number | null; checked_in_count: number | null; side: string | null;
  responded_at?: string | null;
};

/** get_invite_v2 / respond_v2: the guest's own invitation (public fields only). */
export type InviteView = {
  name: string; seats: number; status: GuestStatus; token: string; decline_reason: string | null; confirmed_count: number | null;
  event: {
    title: string; event_type?: string | null; lang?: string | null; invite_line?: string | null; headline?: string | null; note?: string | null;
    starts_at: string | null; ends_at?: string | null; venue: string | null; map_url?: string | null; map_spot?: string | null;
    card_image_url?: string | null; rsvp_deadline?: string | null; allow_changes?: boolean; rsvp_open?: boolean;
  };
  /** the door pass, once it is released (0005/0006) */
  pass?: { key: string; code: string } | null;
  pass_at?: string | null;
  /** 'not_ready' for a draft event */
  closed?: string;
};

/** packages row (read-only in the app: it never sells one) */
export type PackageRow = { code: string; name_en: string; name_ar: string; invite_limit: number; door_included: boolean; design_included: boolean };

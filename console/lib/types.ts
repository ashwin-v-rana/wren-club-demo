// ---- Console staff (agents table, migration 11) --------------------------
export type AgentRole = "csr" | "supervisor" | "admin";

export type Agent = {
  id: string;
  email: string;
  full_name: string;
  role: AgentRole;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
  created_at: string;
};

export type SessionAgent = {
  id: string;
  email: string;
  full_name: string;
  role: AgentRole;
  must_change_password: boolean;
};

// ---- Wren domain (read-only views into the OPERA-mimicking schema) --------
export type ProfileRow = {
  profile_id: string;
  name_given: string;
  name_surname: string;
  email: string | null;
  phone: string | null;
  created_at: string;
};

export type UpcomingStay = {
  arrival_date: string;
  departure_date: string;
  confirmation_number: string;
  room_type: string;
} | null;

// Shape returned by get_entitlement_context(profile_id).
export type EntitlementContext = {
  profile_id: string;
  name: string;
  name_given: string;
  name_surname: string;
  email: string | null;
  phone: string | null;
  is_member: boolean;
  membership_years: number;
  membership_id: string | null;
  in_house: boolean;
  in_house_room: string | null;
  upcoming_stay: UpcomingStay;
  stays_this_year: number;
};

export type AuthEvent = {
  auth_event_id: string;
  profile_id: string | null;
  channel: string | null;
  event_type: string;
  result: "success" | "failure";
  created_at: string;
};

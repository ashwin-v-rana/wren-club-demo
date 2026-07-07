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

// ---- Phase 2: demo boards (OPERA-shaped reads) ---------------------------
export type Reservation = {
  reservation_id: string;
  confirmation_number: string;
  profile_id: string;
  guest_name: string;
  room_type_code: string;
  room_type_name: string;
  room_number: string | null;
  arrival_date: string;
  departure_date: string;
  adults: number;
  reservation_status: "Reserved" | "CheckedIn" | "CheckedOut" | "Cancelled" | "NoShow";
};

export type RoomType = {
  room_type_code: string;
  display_name: string;
};

export type ServiceRequest = {
  service_request_id: string;
  code: string;
  description: string;
  status: "Open" | "InProgress" | "Completed" | "Cancelled";
  priority: "Standard" | "High";
  department: string;
  profile_id: string;
  guest_name: string;
  room: string;
  quantity: number;
  open_date: string;
  comment: string | null;
  completion_date: string | null;
};

export type SpaBooking = {
  activity_booking_id: string;
  profile_id: string;
  guest_name: string;
  activity_type_code: string;
  activity_name: string;
  booking_date: string;
  booking_time: string;
  status: "Booked" | "Completed" | "Cancelled" | "NoShow";
};

export type UpgradeOffer = {
  offer_id: string;
  profile_id: string;
  guest_name: string;
  from_room_type: string;
  from_name: string;
  to_room_type: string;
  to_name: string;
  status: "Offered" | "Accepted" | "Declined" | "Expired";
  offered_at: string;
  expires_at: string;
  responded_at: string | null;
};

export type OutboundMessage = {
  message_id: string;
  profile_id: string;
  guest_name: string;
  channel: "sms" | "whatsapp" | "email";
  trigger_type: string;
  body: string;
  sent_at: string;
};

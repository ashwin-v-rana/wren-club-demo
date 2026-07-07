import { createClient } from "@supabase/supabase-js";

// Server-only Supabase client (service role). The browser NEVER imports this.
// Per the project's hard rule there are no NEXT_PUBLIC_SUPABASE_* vars: the URL
// and the service-role key are both server-only.
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

-- ============================================================================
-- 05_harden.sql — security hardening for the SECURITY DEFINER function layer.
-- Reinforces the demo's access model (browser/agents reach Supabase only via
-- the service-role key; RLS on every table denies anon/authenticated).
--
-- Two fixes applied to EVERY function in schema public:
--   1. Pin search_path (prevents search_path hijacking of SECURITY DEFINER fns).
--   2. Revoke EXECUTE from public/anon/authenticated and grant only to
--      service_role — otherwise these SECURITY DEFINER functions are callable
--      over PostgREST RPC by a leaked anon key AND bypass RLS. Belt-and-braces.
-- Owner (postgres) always retains execute, so internal function-to-function
-- calls and migrations are unaffected.
-- ============================================================================

do $$
declare r record;
begin
  for r in
    select oid::regprocedure as f
    from pg_proc
    where pronamespace = 'public'::regnamespace and prokind = 'f'
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.f);
    execute format('revoke execute on function %s from public, anon, authenticated', r.f);
    execute format('grant execute on function %s to service_role', r.f);
  end loop;
end $$;

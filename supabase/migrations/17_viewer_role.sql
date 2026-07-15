-- 17_viewer_role.sql
-- Add a read-only 'viewer' console role.
--
-- The console (migration 11) shipped with csr/supervisor/admin, but every write
-- API is gated only by requireAuth -- so any of those three can mutate data.
-- 'viewer' is a genuine read-only staff login: it authenticates and reads every
-- board, but the new requireWriter guard (console lib/admin-guard.ts) rejects it
-- from every mutating route (403). Used for the alice/bob/carol demo accounts.
--
-- Enforcement lives in the Next.js backend, not RLS: all data access is
-- service-role via the backend, so the role gate is applied there.

alter table agents drop constraint if exists agents_role_check;
alter table agents add  constraint agents_role_check
  check (role in ('csr', 'supervisor', 'admin', 'viewer'));

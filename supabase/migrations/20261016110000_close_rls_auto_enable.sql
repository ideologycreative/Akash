-- The project's "Enable automatic RLS" option installs
-- public.rls_auto_enable(), an event-trigger function that turns RLS
-- on for every new table. It is SECURITY DEFINER and, like every new
-- public function, executable by anon and authenticated. It returns
-- event_trigger, so it cannot actually be called over the API — but
-- nothing outside the database needs it, so close it anyway and keep
-- the security advisor clean.
--
-- Revoking EXECUTE does not stop the trigger firing: event triggers
-- run for DDL, which only the owner (postgres) performs.
do $$
begin
  if exists (
    select 1 from pg_proc
    where proname = 'rls_auto_enable' and pronamespace = 'public'::regnamespace
  ) then
    revoke all on function public.rls_auto_enable() from public, anon, authenticated;
  end if;
end
$$;

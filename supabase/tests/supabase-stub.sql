-- =====================================================================
--  A minimal stand-in for the parts of a Supabase project that the
--  migrations depend on, so they can be tested against a real
--  PostgreSQL without Docker.
--
--  It reproduces Supabase's behaviour where it matters for security:
--    · the anon / authenticated / service_role roles
--    · auth.uid() reading the JWT claims the way PostgREST sets them
--    · the WORST-CASE default privileges (the "automatically expose
--      new tables" setting switched on): anything postgres creates in
--      public is granted to anon and authenticated. The migration has
--      to be safe against that, so the tests run against it.
--    · storage.buckets / storage.objects with RLS and foldername()
--    · the supabase_realtime publication
-- =====================================================================

create role anon          nologin noinherit;
create role authenticated nologin noinherit;
create role service_role  nologin noinherit bypassrls;

create schema extensions;
create extension pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role;

-- ---------------------------------------------------------------- auth
create schema auth;
grant usage on schema auth to anon, authenticated, service_role;

create table auth.users (
  id                 uuid primary key,
  email              text,
  email_confirmed_at timestamptz,
  created_at         timestamptz not null default now()
);

create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text language sql stable as $$
  select auth.jwt() ->> 'role'
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

-- --------------------------------------------- Supabase default grants
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- -------------------------------------------------------------- storage
create schema storage;
grant usage on schema storage to anon, authenticated, service_role;

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text not null,
  owner      uuid,
  created_at timestamptz default now(),
  metadata   jsonb
);
alter table storage.objects enable row level security;
grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;

-- Same definition Supabase ships.
create function storage.foldername(name text) returns text[] language plpgsql immutable as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

-- ------------------------------------------------------------- realtime
create publication supabase_realtime;

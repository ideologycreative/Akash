-- =====================================================================
--  Ideology — initial schema
--
--  Rules this migration enforces, each one in the database itself so
--  that no client — buggy, stale or hostile — can get around it:
--
--  1. Tenancy. Every content row carries workspace_id, and every
--     reference between rows is a composite foreign key that includes
--     it. A post can only point at an account of its own studio; the
--     database refuses anything else.
--  2. Default deny. Row Level Security is on for every table. The
--     anon role has no privileges on anything. The authenticated role
--     gets explicit grants table by table, so the "automatically
--     expose new tables" project setting is irrelevant either way.
--  3. Optimistic concurrency. Every row has a version that only the
--     database increments. Writers send the version they loaded; a
--     stale write changes nothing and the app merges or asks.
--  4. The client link never touches a table. Clients are not users:
--     they reach the database only through client_preview() and
--     client_review(), executable by the service role alone, called
--     from the `anteprima` Edge Function after it validates input.
--  5. Media is stored as references (storage paths or https links),
--     never inline. Base64 in a row bloats every read and every
--     realtime message; a check constraint refuses it.
--  6. The approval history is append-only. Members may add studio
--     events in their own name; client events are written only by
--     client_review(). Nobody can edit or delete history via the API.
--     The client's own words on a post (client_note) are likewise
--     theirs: a studio update cannot change them.
--  7. Joining a studio is always the invited person's explicit choice.
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

comment on schema private is
  'Helpers used by policies, constraints and RPCs. Not exposed by the Data API.';

-- ---------------------------------------------------------------------
--  Pure helpers (no table access)
-- ---------------------------------------------------------------------

-- 192 bits from the CSPRNG. Share links are bearer secrets.
create function private.new_token() returns text
language sql volatile
set search_path = ''
as $$ select encode(extensions.gen_random_bytes(24), 'hex') $$;

-- A media reference is one of:
--   ''                                   nothing
--   https://… or http://…                a pasted link
--   <workspace_id>/<…>                   a file in this studio's storage folder
-- Never a data: URL, never another scheme, never a path into another
-- studio's folder (the client link signs these paths with the service
-- role, so a foreign path would hand out another studio's file).
create function private.media_ref_ok(ref text, ws uuid) returns boolean
language sql immutable
set search_path = ''
as $$
  select ref is not null
     and char_length(ref) <= 2048
     and (
          ref = ''
       or ref ~* '^https?://[^[:space:]]+$'
       or (    left(ref, 37) = ws::text || '/'
           and ref ~ '^[A-Za-z0-9/_.-]+$'
           and position('..' in ref) = 0)
     )
$$;

-- Slides and storyboard frames: an array of objects whose `url` is a
-- valid media reference for the same studio.
create function private.media_list_ok(items jsonb, ws uuid) returns boolean
language sql immutable
set search_path = ''
as $$
  select jsonb_typeof(items) = 'array'
     and jsonb_array_length(items) <= 50
     and not exists (
       select 1 from jsonb_array_elements(items) e
       where jsonb_typeof(e) <> 'object'
          or not private.media_ref_ok(coalesce(e ->> 'url', ''), ws)
     )
$$;

-- ---------------------------------------------------------------------
--  Workspaces and membership
-- ---------------------------------------------------------------------

create table public.workspaces (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  prefs       jsonb not null default '{"ugcDays":[1,3,5]}'::jsonb
              check (jsonb_typeof(prefs) = 'object' and pg_column_size(prefs) <= 4096),
  created_at  timestamptz not null default clock_timestamp(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  version     integer not null default 1
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  role         text not null default 'editor' check (role in ('owner', 'editor')),
  email        text not null default '',
  display_name text not null default '' check (char_length(display_name) <= 120),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);
create index workspace_members_user_idx on public.workspace_members (user_id);

create table public.workspace_invites (
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  email        text not null
               check (email = lower(btrim(email)) and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  role         text not null default 'editor' check (role in ('owner', 'editor')),
  invited_by   uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  primary key (workspace_id, email)
);
create index workspace_invites_email_idx on public.workspace_invites (email);

-- ---------------------------------------------------------------------
--  Content
-- ---------------------------------------------------------------------

create table public.clients (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  name          text not null check (char_length(btrim(name)) between 1 and 200),
  slug          text not null default '' check (char_length(slug) <= 80),
  slug_locked   boolean not null default false,
  status        text not null default 'attivo' check (status in ('attivo', 'pausa', 'chiuso')),
  note          text not null default '' check (char_length(note) <= 20000),
  goals         jsonb not null default '{"post":12,"reel":4,"stories":20,"ugc":8}'::jsonb
                check (jsonb_typeof(goals) = 'object' and pg_column_size(goals) <= 1024),
  palette       jsonb not null
                default '{"bg":"#F2ECE4","ink":"#241E19","accent":"#9A5B3C","alt":"#6E6256"}'::jsonb
                check (jsonb_typeof(palette) = 'object' and pg_column_size(palette) <= 1024),
  share_token   text not null default private.new_token()
                check (share_token ~ '^[A-Za-z0-9_-]{32,128}$'),
  share_enabled boolean not null default true,
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  version       integer not null default 1,
  unique (workspace_id, id),
  unique (share_token)
);

create table public.accounts (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  client_id     uuid not null,
  handle        text not null default '' check (char_length(handle) <= 120),
  platform      text not null default 'Instagram'
                check (platform in ('Instagram', 'TikTok', 'Facebook', 'LinkedIn',
                                    'YouTube', 'Pinterest', 'X', 'Altro')),
  ratio         text not null default '' check (ratio ~ '^$|^\d+(\.\d+)?/\d+(\.\d+)?$'),
  bio           text not null default '' check (char_length(bio) <= 2000),
  followers     integer not null default 0 check (followers >= 0),
  following     integer not null default 0 check (following >= 0),
  avatar        text not null default '' check (private.media_ref_ok(avatar, workspace_id)),
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  version       integer not null default 1,
  unique (workspace_id, id),
  foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade
);
create index accounts_client_idx on public.accounts (workspace_id, client_id);

create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  client_id     uuid not null,
  name          text not null check (char_length(btrim(name)) between 1 and 120),
  color         text not null default '#9A5B3C' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  description   text not null default '' check (char_length(description) <= 2000),
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  version       integer not null default 1,
  unique (workspace_id, id),
  foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade
);
create index categories_client_idx on public.categories (workspace_id, client_id);

create table public.creators (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  client_id     uuid not null,
  name          text not null default '' check (char_length(name) <= 200),
  handle        text not null default '' check (char_length(handle) <= 120),
  followers     integer not null default 0 check (followers >= 0),
  fee           numeric(12, 2) not null default 0 check (fee >= 0),
  status        text not null default 'contattato'
                check (status in ('contattato', 'accordo', 'girato', 'pubblicato')),
  note          text not null default '' check (char_length(note) <= 5000),
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  version       integer not null default 1,
  unique (workspace_id, id),
  foreign key (workspace_id, client_id)
    references public.clients (workspace_id, id) on delete cascade
);
create index creators_client_idx on public.creators (workspace_id, client_id);

create table public.posts (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces (id) on delete cascade,
  account_id     uuid not null,
  month          text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  sort_order     integer not null default 0,
  kind           text not null default 'foto'
                 check (kind in ('foto', 'reel', 'carosello', 'editoriale')),
  media          text not null default '' check (private.media_ref_ok(media, workspace_id)),
  cover          text not null default '' check (private.media_ref_ok(cover, workspace_id)),
  slides         jsonb not null default '[]'::jsonb
                 check (private.media_list_ok(slides, workspace_id) and pg_column_size(slides) <= 65536),
  publish_date   date,
  publish_time   time,
  show_date      boolean not null default true,
  caption        text not null default '' check (char_length(caption) <= 10000),
  category_id    uuid,
  paid           boolean not null default false,
  partner        text not null default '' check (char_length(partner) <= 200),
  video_name     text not null default '' check (char_length(video_name) <= 300),
  also_on        uuid[] not null default '{}' check (cardinality(also_on) <= 20),
  in_stories     boolean not null default false,
  story_ids      uuid[] not null default '{}' check (cardinality(story_ids) <= 200),
  editorial      jsonb not null default '{}'::jsonb
                 check (jsonb_typeof(editorial) = 'object' and pg_column_size(editorial) <= 4096),
  status         text not null default 'bozza'
                 check (status in ('bozza', 'da_approvare', 'in_revisione', 'approvato', 'pubblicato')),
  revisions      integer not null default 0 check (revisions >= 0),
  internal_note  text not null default '' check (char_length(internal_note) <= 10000),
  client_note    text not null default '' check (char_length(client_note) <= 2000),
  client_note_at timestamptz,
  created_at     timestamptz not null default clock_timestamp(),
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users (id) on delete set null,
  version        integer not null default 1,
  unique (workspace_id, id),
  foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, category_id)
    references public.categories (workspace_id, id) on delete set null (category_id)
);
create index posts_account_month_idx on public.posts (workspace_id, account_id, month);
create index posts_category_idx on public.posts (workspace_id, category_id) where category_id is not null;
create index posts_also_on_idx on public.posts using gin (also_on);
create index posts_publish_idx on public.posts (publish_date) where publish_date is not null;

create table public.stories (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  account_id    uuid not null,
  month         text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  sort_order    integer not null default 0,
  kind          text not null default 'story' check (kind in ('story', 'storyboard')),
  title         text not null default '' check (char_length(title) <= 300),
  media         text not null default '' check (private.media_ref_ok(media, workspace_id)),
  frames        jsonb not null default '[]'::jsonb
                check (private.media_list_ok(frames, workspace_id) and pg_column_size(frames) <= 65536),
  story_date    date,
  note          text not null default '' check (char_length(note) <= 5000),
  is_ugc        boolean not null default false,
  status        text not null default 'bozza'
                check (status in ('bozza', 'da_approvare', 'in_revisione', 'approvato', 'pubblicato')),
  from_post_id  uuid,
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  version       integer not null default 1,
  unique (workspace_id, id),
  foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id) on delete cascade,
  -- The "also in Stories" mirror lives and dies with its post.
  foreign key (workspace_id, from_post_id)
    references public.posts (workspace_id, id) on delete cascade
);
create index stories_account_month_idx on public.stories (workspace_id, account_id, month);
create index stories_from_post_idx on public.stories (workspace_id, from_post_id) where from_post_id is not null;
-- At most one mirror per post.
create unique index stories_one_mirror_idx on public.stories (workspace_id, from_post_id) where from_post_id is not null;

create table public.highlights (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  account_id    uuid not null,
  title         text not null default '' check (char_length(title) <= 120),
  cover         text not null default '' check (private.media_ref_ok(cover, workspace_id)),
  story_ids     uuid[] not null default '{}' check (cardinality(story_ids) <= 500),
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  version       integer not null default 1,
  unique (workspace_id, id),
  foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id) on delete cascade
);
create index highlights_account_idx on public.highlights (workspace_id, account_id);

create table public.ugc_slots (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  account_id    uuid not null,
  slot_date     date not null,
  mode          text not null default 'autonoma' check (mode in ('autonoma', 'creator', 'template')),
  status        text not null default 'idea' check (status in ('idea', 'brief', 'girato', 'consegnato')),
  brief         text not null default '' check (char_length(brief) <= 5000),
  creator_id    uuid,
  note          text not null default '' check (char_length(note) <= 5000),
  created_at    timestamptz not null default clock_timestamp(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id) on delete set null,
  version       integer not null default 1,
  unique (workspace_id, id),
  foreign key (workspace_id, account_id)
    references public.accounts (workspace_id, id) on delete cascade,
  foreign key (workspace_id, creator_id)
    references public.creators (workspace_id, id) on delete set null (creator_id)
);
create index ugc_slots_account_date_idx on public.ugc_slots (workspace_id, account_id, slot_date);
create index ugc_slots_creator_idx on public.ugc_slots (workspace_id, creator_id) where creator_id is not null;

-- Append-only approval history.
create table public.post_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id) on delete cascade,
  post_id       uuid not null,
  at            timestamptz not null default now(),
  from_status   text check (from_status in ('bozza', 'da_approvare', 'in_revisione', 'approvato', 'pubblicato')),
  to_status     text not null
                check (to_status in ('bozza', 'da_approvare', 'in_revisione', 'approvato', 'pubblicato')),
  actor         text not null check (actor in ('studio', 'cliente')),
  actor_user    uuid references auth.users (id) on delete set null,
  note          text not null default '' check (char_length(note) <= 2000),
  foreign key (workspace_id, post_id)
    references public.posts (workspace_id, id) on delete cascade
);
create index post_events_post_idx on public.post_events (workspace_id, post_id, at);
create index post_events_recent_idx on public.post_events (workspace_id, at desc);

-- ---------------------------------------------------------------------
--  Membership helpers (security definer: they read workspace_members
--  without recursing through its own policies)
-- ---------------------------------------------------------------------

create function private.my_workspace_ids() returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select m.workspace_id
  from public.workspace_members m
  where m.user_id = (select auth.uid())
$$;

create function private.is_owner(ws uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspace_members m
    where m.workspace_id = ws
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  )
$$;

-- ---------------------------------------------------------------------
--  Triggers
-- ---------------------------------------------------------------------

-- Versioning and bookkeeping. The database owns version, updated_at,
-- updated_by and created_at; whatever a client sends for them is
-- overwritten. A writer that sends a version must send the current
-- one, so even a client that forgets to filter cannot overwrite a
-- newer row.
create function private.touch() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.version    := 1;
    new.updated_at := now();
    new.updated_by := auth.uid();
    if new.created_at is null or new.created_at > clock_timestamp() then
      new.created_at := clock_timestamp();
    end if;
    return new;
  end if;

  if new.id is distinct from old.id then
    raise exception 'id is immutable' using errcode = '42501';
  end if;
  if tg_table_name <> 'workspaces'
     and (to_jsonb(new) ->> 'workspace_id') is distinct from (to_jsonb(old) ->> 'workspace_id') then
    raise exception 'workspace_id is immutable' using errcode = '42501';
  end if;
  if new.version is distinct from old.version then
    raise exception 'version_conflict' using errcode = '40001',
      detail = format('expected %s, current %s', new.version, old.version);
  end if;

  new.created_at := old.created_at;
  new.version    := old.version + 1;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end
$$;

do $$
declare t text;
begin
  foreach t in array array['workspaces', 'clients', 'accounts', 'categories', 'creators',
                           'posts', 'stories', 'highlights', 'ugc_slots']
  loop
    execute format(
      'create trigger touch before insert or update on public.%I
         for each row execute function private.touch()', t);
  end loop;
end
$$;

-- History events: never in the future, and a studio event is always
-- signed by whoever is actually logged in.
create function private.stamp_event() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.at := least(coalesce(new.at, now()), now());
  if new.actor = 'studio' then
    new.actor_user := auth.uid();
  end if;
  return new;
end
$$;

create trigger stamp before insert on public.post_events
  for each row execute function private.stamp_event();

-- The client's words and their timestamp are written by
-- client_review() only. A studio member updating a post through the
-- API cannot change them (they keep their previous value). Inserts
-- are allowed so a browser document can be brought over intact.
-- client_review() runs as the table owner, so it is not affected.
create function private.keep_client_feedback() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('authenticated', 'anon') then
    new.client_note    := old.client_note;
    new.client_note_at := old.client_note_at;
  end if;
  return new;
end
$$;

create trigger keep_client_feedback before update on public.posts
  for each row execute function private.keep_client_feedback();

-- A workspace always keeps at least one owner. The rule does not
-- apply while the workspace itself, or the user's login, is being
-- deleted: those cascades must be allowed to finish.
create function private.keep_an_owner() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_demoted boolean;
begin
  if tg_op = 'DELETE' then
    v_demoted := old.role = 'owner';
  else
    v_demoted := old.role = 'owner' and new.role <> 'owner';
  end if;

  if v_demoted
     and exists (select 1 from public.workspaces w where w.id = old.workspace_id)
     and exists (select 1 from auth.users u where u.id = old.user_id)
     and not exists (
       select 1 from public.workspace_members m
       where m.workspace_id = old.workspace_id
         and m.role = 'owner'
         and m.user_id <> old.user_id
     )
  then
    raise exception 'last_owner' using errcode = '42501',
      hint = 'Nomina un altro proprietario prima.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end
$$;

create trigger keep_an_owner before update or delete on public.workspace_members
  for each row execute function private.keep_an_owner();

-- ---------------------------------------------------------------------
--  Row Level Security
-- ---------------------------------------------------------------------

alter table public.workspaces        enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_invites enable row level security;

create policy "workspaces: members read" on public.workspaces
  for select to authenticated
  using (id in (select private.my_workspace_ids()));

create policy "workspaces: members update" on public.workspaces
  for update to authenticated
  using (id in (select private.my_workspace_ids()))
  with check (id in (select private.my_workspace_ids()));

create policy "members: see your studio" on public.workspace_members
  for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));

create policy "members: owners change roles" on public.workspace_members
  for update to authenticated
  using ((select private.is_owner(workspace_id)))
  with check ((select private.is_owner(workspace_id)));

create policy "members: owners remove, anyone leaves" on public.workspace_members
  for delete to authenticated
  using (user_id = (select auth.uid()) or (select private.is_owner(workspace_id)));

create policy "invites: members read" on public.workspace_invites
  for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));

create policy "invites: owners create" on public.workspace_invites
  for insert to authenticated
  with check ((select private.is_owner(workspace_id)) and invited_by = (select auth.uid()));

create policy "invites: owners revoke" on public.workspace_invites
  for delete to authenticated
  using ((select private.is_owner(workspace_id)));

-- Every content table gets the same four policies. Generated so that
-- no table can be added to this list and forgotten in one of them.
do $$
declare t text;
begin
  foreach t in array array['clients', 'accounts', 'categories', 'creators',
                           'posts', 'stories', 'highlights', 'ugc_slots']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'create policy "%1$s: members read" on public.%1$I for select to authenticated
         using (workspace_id in (select private.my_workspace_ids()))', t);
    execute format(
      'create policy "%1$s: members insert" on public.%1$I for insert to authenticated
         with check (workspace_id in (select private.my_workspace_ids()))', t);
    execute format(
      'create policy "%1$s: members update" on public.%1$I for update to authenticated
         using (workspace_id in (select private.my_workspace_ids()))
         with check (workspace_id in (select private.my_workspace_ids()))', t);
    execute format(
      'create policy "%1$s: members delete" on public.%1$I for delete to authenticated
         using (workspace_id in (select private.my_workspace_ids()))', t);
  end loop;
end
$$;

alter table public.post_events enable row level security;

create policy "events: members read" on public.post_events
  for select to authenticated
  using (workspace_id in (select private.my_workspace_ids()));

-- Members add studio events only, in their own name (stamp_event sets
-- actor_user before this check runs). Client events come from
-- client_review(), which runs as the table owner.
create policy "events: members add studio events" on public.post_events
  for insert to authenticated
  with check (
    workspace_id in (select private.my_workspace_ids())
    and actor = 'studio'
    and actor_user = (select auth.uid())
  );

-- ---------------------------------------------------------------------
--  Grants — start from nothing, add exactly what the app uses
-- ---------------------------------------------------------------------

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- And for everything later migrations create: nothing is exposed until
-- a migration grants it on purpose. (PUBLIC's EXECUTE on new functions
-- can only be removed per function — every migration that adds a
-- public function must revoke it explicitly. db.test.mjs checks.)
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

grant select                         on public.workspaces        to authenticated;
grant update (name, prefs, version)  on public.workspaces        to authenticated;
grant select, delete                 on public.workspace_members to authenticated;
grant update (role)                  on public.workspace_members to authenticated;
grant select, insert, delete         on public.workspace_invites to authenticated;

grant select, insert, update, delete on
  public.clients, public.accounts, public.categories, public.creators,
  public.posts, public.stories, public.highlights, public.ugc_slots
  to authenticated;

grant select, insert on public.post_events to authenticated;

grant all on all tables in schema public to service_role;

-- Private helpers: callable where policies, defaults and checks need
-- them. The schema is not exposed, so none of these is an endpoint.
revoke all on all functions in schema private from public, anon;
grant execute on function
  private.new_token(), private.media_ref_ok(text, uuid), private.media_list_ok(jsonb, uuid),
  private.my_workspace_ids(), private.is_owner(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------
--  RPCs for the studio (authenticated)
-- ---------------------------------------------------------------------

-- First login: create the studio and become its owner.
create function public.create_workspace(p_name text) returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_ws    uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if (select count(*) from public.workspace_members m
      where m.user_id = v_uid and m.role = 'owner') >= 5 then
    raise exception 'too_many_workspaces' using errcode = '54000';
  end if;

  select u.email into v_email from auth.users u where u.id = v_uid;

  insert into public.workspaces (name) values (btrim(p_name)) returning id into v_ws;
  insert into public.workspace_members (workspace_id, user_id, role, email)
    values (v_ws, v_uid, 'owner', coalesce(lower(v_email), ''));
  return v_ws;
end
$$;

-- Invites are never accepted automatically: anyone who owns a studio
-- can invite any address, so joining is the invited person's choice.
-- Only a confirmed address counts, so signing up with someone else's
-- email gets you nothing.

create function private.my_confirmed_email() returns text
language sql stable security definer
set search_path = ''
as $$
  select lower(u.email) from auth.users u
  where u.id = (select auth.uid()) and u.email_confirmed_at is not null
$$;
revoke all on function private.my_confirmed_email() from public, anon, authenticated;

-- What is waiting for me: studio name, role, who invited.
create function public.pending_invites() returns table (
  workspace_id uuid, workspace_name text, role text, invited_by_email text, created_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select i.workspace_id, w.name, i.role, coalesce(lower(u.email), ''), i.created_at
  from public.workspace_invites i
  join public.workspaces w on w.id = i.workspace_id
  left join auth.users u on u.id = i.invited_by
  where i.email = private.my_confirmed_email()
  order by i.created_at
$$;

create function public.accept_invite(p_workspace uuid) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := private.my_confirmed_email();
  v_role  text;
begin
  if v_uid is null or v_email is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  delete from public.workspace_invites i
  where i.workspace_id = p_workspace and i.email = v_email
  returning i.role into v_role;
  if v_role is null then
    raise exception 'no_invite' using errcode = 'P0002';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role, email)
    values (p_workspace, v_uid, v_role, v_email)
  on conflict (workspace_id, user_id) do nothing;
  return true;
end
$$;

create function public.decline_invite(p_workspace uuid) returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := private.my_confirmed_email();
begin
  if v_email is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from public.workspace_invites i where i.workspace_id = p_workspace and i.email = v_email;
  return found;
end
$$;

-- ---------------------------------------------------------------------
--  RPCs for the client link (service role only)
-- ---------------------------------------------------------------------

-- The only data a client may see. An allow-list: a column added to
-- posts does not appear here until someone decides it should.
create function public.client_preview(p_token text) returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  c     public.clients;
  v_acc uuid[];
begin
  select * into c from public.clients
  where share_token = p_token and share_enabled;
  if not found then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(a.id), '{}') into v_acc
  from public.accounts a where a.client_id = c.id;

  return jsonb_build_object(
    'client', jsonb_build_object(
      'name',    c.name,
      'slug',    c.slug,
      'palette', jsonb_build_object(
        'bg',     coalesce(c.palette ->> 'bg', ''),
        'ink',    coalesce(c.palette ->> 'ink', ''),
        'accent', coalesce(c.palette ->> 'accent', ''),
        'alt',    coalesce(c.palette ->> 'alt', ''))
    ),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',        a.id,
               'handle',    a.handle,
               'platform',  a.platform,
               'ratio',     a.ratio,
               'bio',       a.bio,
               'followers', a.followers,
               'following', a.following,
               'avatar',    a.avatar
             ) order by a.created_at, a.id)
      from public.accounts a
      where a.client_id = c.id
    ), '[]'::jsonb),
    'posts', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id',           p.id,
               'accountIds',   (select coalesce(jsonb_agg(x), '[]'::jsonb)
                                from unnest(array[p.account_id] || p.also_on) x
                                where x = any (v_acc)),
               'month',        p.month,
               'kind',         p.kind,
               'cover',        p.cover,
               'media',        p.media,
               'slides',       (select coalesce(jsonb_agg(jsonb_build_object(
                                         'id',  coalesce(s ->> 'id', ''),
                                         'url', coalesce(s ->> 'url', ''))), '[]'::jsonb)
                                from jsonb_array_elements(p.slides) s),
               'editorial',    case when p.kind = 'editoriale' then jsonb_build_object(
                                 'eyebrow', coalesce(p.editorial ->> 'eyebrow', ''),
                                 'title',   coalesce(p.editorial ->> 'title', ''),
                                 'sub',     coalesce(p.editorial ->> 'sub', ''))
                               end,
               'date',         coalesce(p.publish_date::text, ''),
               'showDate',     p.show_date,
               'caption',      p.caption,
               'category',     case when cat.id is not null then
                                 jsonb_build_object('name', cat.name, 'color', cat.color)
                               end,
               'paid',         p.paid,
               'partner',      btrim(p.partner),
               'status',       p.status,
               'clientNote',   p.client_note,
               'clientNoteAt', coalesce(to_char(p.client_note_at at time zone 'UTC',
                                                'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
               'revisions',    p.revisions
             ) order by p.publish_date nulls last, p.publish_time nulls last,
                        p.sort_order, p.created_at)
      from public.posts p
      left join public.categories cat
        on cat.id = p.category_id and cat.workspace_id = p.workspace_id
      where p.workspace_id = c.workspace_id
        and p.status <> 'bozza'
        and (p.account_id = any (v_acc) or p.also_on && v_acc)
    ), '[]'::jsonb)
  );
end
$$;

-- The only change a client may make: approve, ask for a change with a
-- message, or take either back. Never on a draft, never on published
-- content, never on another client's post.
create function public.client_review(
  p_token   text,
  p_post_id uuid,
  p_action  text,
  p_note    text default ''
) returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  c      public.clients;
  p      public.posts;
  v_acc  uuid[];
  v_from text;
  v_to   text;
  v_note text := btrim(coalesce(p_note, ''));
begin
  select * into c from public.clients
  where share_token = p_token and share_enabled;
  if not found then
    raise exception 'invalid_token' using errcode = 'P0002';
  end if;

  select coalesce(array_agg(a.id), '{}') into v_acc
  from public.accounts a where a.client_id = c.id;

  select * into p from public.posts
  where id = p_post_id and workspace_id = c.workspace_id
  for update;

  -- Not found, not theirs and still a draft all look the same from
  -- outside: nothing here says which posts exist.
  if not found
     or p.status = 'bozza'
     or not (p.account_id = any (v_acc) or p.also_on && v_acc) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  v_from := p.status;

  if p_action = 'approva' then
    v_to := 'approvato';
    if v_from = v_to then
      return jsonb_build_object('status', p.status, 'revisions', p.revisions,
        'clientNote', p.client_note, 'changed', false);
    end if;
    if v_from not in ('da_approvare', 'in_revisione') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
  elsif p_action = 'revisione' then
    v_to := 'in_revisione';
    if v_note = '' then
      raise exception 'note_required' using errcode = 'P0001';
    end if;
    if v_from not in ('da_approvare', 'approvato', 'in_revisione') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
    v_note := left(v_note, 2000);
  elsif p_action = 'annulla' then
    v_to := 'da_approvare';
    if v_from = v_to then
      return jsonb_build_object('status', p.status, 'revisions', p.revisions,
        'clientNote', p.client_note, 'changed', false);
    end if;
    if v_from not in ('approvato', 'in_revisione') then
      raise exception 'invalid_transition' using errcode = 'P0001';
    end if;
  else
    raise exception 'invalid_action' using errcode = 'P0001';
  end if;

  -- The client's words go in the client's field. internal_note is
  -- never touched.
  update public.posts set
    status         = v_to,
    revisions      = revisions + case when p_action = 'revisione' then 1 else 0 end,
    client_note    = case when p_action = 'revisione' then v_note else client_note end,
    client_note_at = case when p_action = 'revisione' then now() else client_note_at end
  where id = p.id
  returning * into p;

  insert into public.post_events (workspace_id, post_id, from_status, to_status, actor, note)
  values (c.workspace_id, p.id, v_from, v_to, 'cliente',
          case when p_action = 'revisione' then v_note else '' end);

  return jsonb_build_object(
    'status',       p.status,
    'revisions',    p.revisions,
    'clientNote',   p.client_note,
    'clientNoteAt', coalesce(to_char(p.client_note_at at time zone 'UTC',
                                     'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
    'changed',      true
  );
end
$$;

-- Supabase grants EXECUTE on new public functions to anon and
-- authenticated by default. Take it back and give it out precisely.
revoke all on function public.create_workspace(text)                  from public, anon, authenticated;
revoke all on function public.pending_invites()                       from public, anon, authenticated;
revoke all on function public.accept_invite(uuid)                     from public, anon, authenticated;
revoke all on function public.decline_invite(uuid)                    from public, anon, authenticated;
revoke all on function public.client_preview(text)                    from public, anon, authenticated;
revoke all on function public.client_review(text, uuid, text, text)   from public, anon, authenticated;

grant execute on function public.create_workspace(text) to authenticated;
grant execute on function public.pending_invites()      to authenticated;
grant execute on function public.accept_invite(uuid)    to authenticated;
grant execute on function public.decline_invite(uuid)   to authenticated;
grant execute on function public.client_preview(text)                  to service_role;
grant execute on function public.client_review(text, uuid, text, text) to service_role;

-- ---------------------------------------------------------------------
--  Realtime: colleagues see each other's changes as they happen.
--  Realtime applies the same RLS policies per subscriber.
-- ---------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.workspaces, public.clients, public.accounts, public.categories,
      public.creators, public.posts, public.stories, public.highlights,
      public.ugc_slots, public.post_events;
  end if;
end
$$;

-- ---------------------------------------------------------------------
--  Storage: one private bucket. Paths are
--    <workspace_id>/<client_id>/<uuid>.<ext>
--  The first folder decides access. Studio members read through
--  signed URLs; the client link gets short-lived signed URLs from the
--  Edge Function. Nothing in the bucket is public. SVG is refused: it
--  can carry script.
-- ---------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media', 'media', false, 52428800,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif',
        'video/mp4', 'video/quicktime', 'video/webm']
)
on conflict (id) do update set
  public             = false,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "media: members read" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in (select w::text from private.my_workspace_ids() w)
  );

-- Object names follow the same rule as media references in rows:
-- <workspace uuid>/<safe characters>, no "..", nothing encoded.
create function private.object_name_ok(name text) returns boolean
language sql immutable
set search_path = ''
as $$
  select name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9/_.-]+$'
     and position('..' in name) = 0
     and char_length(name) <= 512
$$;
revoke all on function private.object_name_ok(text) from public, anon;
grant execute on function private.object_name_ok(text) to authenticated, service_role;

create policy "media: members upload" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and private.object_name_ok(name)
    and (storage.foldername(name))[1] in (select w::text from private.my_workspace_ids() w)
  );

create policy "media: members replace" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in (select w::text from private.my_workspace_ids() w)
  )
  with check (
    bucket_id = 'media'
    and private.object_name_ok(name)
    and (storage.foldername(name))[1] in (select w::text from private.my_workspace_ids() w)
  );

create policy "media: members delete" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] in (select w::text from private.my_workspace_ids() w)
  );

-- fixture-pre-028.sql - TEST ONLY. A local stand-in for the live project's
-- state BEFORE 028/029, built from 028's own rollback block (the exact prior
-- policies) and ZAOOS doc 1060's findings. Loaded into a throwaway local
-- database by rls-test.sh. Never run this against the live project.

-- Supabase's API roles. service_role bypasses RLS, as on the platform.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
  -- An ordinary DDL-running role that owns nothing here, to prove the event
  -- trigger still fires for a caller other than the function's owner.
  if not exists (select 1 from pg_roles where rolname = 'ddl_user') then create role ddl_user nologin; end if;
end $$;
grant usage, create on schema public to ddl_user;
grant usage on schema public to anon, authenticated, service_role;

-- The 13 section-A tables, one column each beyond the id; the columns do not
-- matter to RLS.
do $$
declare t text;
begin
  foreach t in array array['activity_log','artists','budget_entries','circle_members','circles',
                           'contact_log','goals','meeting_notes','sponsors','suggestions','tasks',
                           'team_members','volunteers'] loop
    execute format('create table public.%I (id serial primary key, body text)', t);
    execute format('insert into public.%I (body) values (%L)', t, t || ' row');
    execute format('alter table public.%I enable row level security', t);
    execute format('grant all on public.%I to anon, authenticated, service_role', t);
    -- Supabase grants the API roles the sequences too; without this an insert
    -- fails on the sequence before RLS is ever consulted.
    execute format('grant usage on sequence public.%I to anon, authenticated, service_role', t || '_id_seq');
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)',
                   t || '_authenticated_all', t);
  end loop;
end $$;

create table public.fleet_status (session text primary key, state text);
insert into public.fleet_status values ('zuke', 'working');
alter table public.fleet_status enable row level security;
grant all on public.fleet_status to anon, authenticated, service_role;
create policy "fleet read" on public.fleet_status for select to public using (true);

create table public.photos (id serial primary key, url text);
alter table public.photos enable row level security;
grant all on public.photos to anon, authenticated, service_role;
create policy photos_select_authenticated on public.photos for select to public using (true);

create table public.app_votes (id serial primary key, app text, voter text);
insert into public.app_votes (app, voter) values ('a', 'x');
alter table public.app_votes enable row level security;
grant all on public.app_votes to anon, authenticated, service_role;
create policy "anon can read votes"      on public.app_votes for select to anon using (true);
create policy "anon can insert votes"    on public.app_votes for insert to anon with check (true);
create policy "anon can update own vote" on public.app_votes for update to anon using (true);

create view public.app_vote_stats as select app, count(*) as votes from public.app_votes group by app;
grant select on public.app_vote_stats to anon, authenticated, service_role;

-- Modelled on Supabase's RLS-on-new-tables helper, which is what the name
-- suggests. SECURITY DEFINER, EXECUTE left at the default (PUBLIC) plus explicit
-- grants, as doc 1060 found anon and authenticated could both run it.
create function public.rls_auto_enable() returns event_trigger
language plpgsql security definer set search_path = pg_catalog as $$
declare cmd record;
begin
  for cmd in select * from pg_event_trigger_ddl_commands()
             where command_tag = 'CREATE TABLE' and object_type = 'table' loop
    execute format('alter table %s enable row level security', cmd.object_identity);
  end loop;
end $$;
grant execute on function public.rls_auto_enable() to anon, authenticated, service_role;
create event trigger ensure_rls on ddl_command_end when tag in ('CREATE TABLE')
  execute function public.rls_auto_enable();

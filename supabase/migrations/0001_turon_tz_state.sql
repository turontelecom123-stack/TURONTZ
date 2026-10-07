-- Turon TZ: free-cloud bridge for the current dependency-free Node server.
-- One JSONB document keeps the existing local data model compatible while
-- the app is being migrated to fully normalized tables.

create table if not exists public.turon_tz_state (
  id text primary key check (id = 'main'),
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- No browser role receives direct access. The Node server uses the service
-- role over a private server-to-server connection and is the only writer.
alter table public.turon_tz_state enable row level security;
revoke all on table public.turon_tz_state from anon, authenticated;

-- Private bucket. The server proxies file downloads after checking task access.
insert into storage.buckets (id, name, public, file_size_limit)
values ('turon-tz-files', 'turon-tz-files', false, 8388608)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit;

-- No storage.objects policy is added intentionally: anon/authenticated clients
-- cannot bypass Turon TZ permissions. The Supabase service role bypasses RLS.

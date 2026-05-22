create table if not exists public.game2_state (
  id text primary key default 'main',
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint game2_state_singleton check (id = 'main')
);

drop trigger if exists game2_state_touch_updated_at on public.game2_state;
create trigger game2_state_touch_updated_at
before update on public.game2_state
for each row execute function public.touch_updated_at();

insert into public.game2_state (id, data)
values ('main', '{}'::jsonb)
on conflict (id) do nothing;

alter table public.game2_state enable row level security;

drop policy if exists "game2 state is readable" on public.game2_state;
create policy "game2 state is readable"
on public.game2_state for select
to authenticated
using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'game2_state'
  ) then
    alter publication supabase_realtime add table public.game2_state;
  end if;
end $$;

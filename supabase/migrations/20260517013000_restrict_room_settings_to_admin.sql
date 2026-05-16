alter table public.profiles
add column if not exists is_admin boolean not null default false;

drop policy if exists "authenticated users update room settings" on public.rooms;
drop policy if exists "admins update room settings" on public.rooms;

create policy "admins update room settings"
on public.rooms for update
to authenticated
using (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.profiles
    where profiles.id = auth.uid()
      and profiles.is_admin = true
  )
);

alter table public.profiles
add column if not exists is_admin boolean not null default false;

update public.profiles
set is_admin = true
where nickname = '뚜비';

drop policy if exists "admins update profiles" on public.profiles;
create policy "admins update profiles"
on public.profiles for update
to authenticated
using (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
)
with check (
  exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

drop policy if exists "admins delete profiles" on public.profiles;
create policy "admins delete profiles"
on public.profiles for delete
to authenticated
using (
  id <> auth.uid()
  and exists (
    select 1
    from public.profiles admin_profile
    where admin_profile.id = auth.uid()
      and admin_profile.is_admin = true
  )
);

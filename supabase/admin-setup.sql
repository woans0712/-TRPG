alter table public.profiles
add column if not exists is_admin boolean not null default false;

update public.profiles
set is_admin = true
where nickname = '뚜비';

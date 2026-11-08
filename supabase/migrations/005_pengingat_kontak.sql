-- Migrasi 005: halaman "Pengingat & Alarm" (pengingat umum, jobdesk, daftar kontak)
--   contacts   daftar kontak (nama + nomor WhatsApp) milik pengguna
--   reminders  pengingat mandiri: kind 'umum' atau 'jobdesk' (tugas untuk seorang kontak, bisa berulang)
--
-- Beda dengan pengingat per catatan (kolom notes.remind_at dari migrasi 003): ini pengingat yang berdiri sendiri.
-- Setiap pengguna hanya dapat mengakses barisnya sendiri (Row Level Security).
--
-- Jalankan di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

create or replace function public.now_ms()
returns bigint language sql stable set search_path = ''
as $$ select (extract(epoch from now()) * 1000)::bigint $$;

create table if not exists public.contacts (
  id         uuid   primary key default gen_random_uuid(),
  user_id    uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  name       text   not null check (char_length(name) between 1 and 60),
  phone      text   not null default '' check (phone = '' or phone ~ '^[0-9]{6,16}$'), -- hanya angka, format internasional tanpa +
  created_at bigint not null default public.now_ms()
);
create index if not exists contacts_user_idx on public.contacts (user_id, name);

create table if not exists public.reminders (
  id           uuid    primary key default gen_random_uuid(),
  user_id      uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  kind         text    not null default 'umum' check (kind in ('umum', 'jobdesk')),
  title        text    not null check (char_length(title) between 1 and 100),
  detail       text    not null default '' check (char_length(detail) <= 500),
  due_at       bigint  not null,
  alert_day    boolean not null default true,   -- H-1 hari
  alert_hour   boolean not null default true,   -- H-60 menit
  alert_ontime boolean not null default true,   -- tepat waktu
  wa_notify    boolean not null default false,  -- siapkan pesan WhatsApp ke kontak saat alarm
  contact_id   uuid    references public.contacts (id) on delete set null,
  repeat       text    not null default 'none' check (repeat in ('none', 'daily', 'weekly')),
  done         boolean not null default false,
  done_at      bigint,
  created_at   bigint  not null default public.now_ms()
);
create index if not exists reminders_user_due_idx on public.reminders (user_id, done, due_at);

-- Batas jumlah per pengguna.
create or replace function public.limit_user_rows()
returns trigger language plpgsql set search_path = ''
as $$
declare n bigint; cap int := tg_argv[0]::int;
begin
  execute format('select count(*) from public.%I where user_id = $1', tg_table_name) into n using new.user_id;
  if n >= cap then
    raise exception 'Batas % data tercapai', cap;
  end if;
  return new;
end;
$$;
drop trigger if exists contacts_limit on public.contacts;
create trigger contacts_limit before insert on public.contacts
  for each row execute function public.limit_user_rows(200);
drop trigger if exists reminders_limit on public.reminders;
create trigger reminders_limit before insert on public.reminders
  for each row execute function public.limit_user_rows(500);

alter table public.contacts  enable row level security;
alter table public.reminders enable row level security;

drop policy if exists "contacts_own"  on public.contacts;
drop policy if exists "reminders_own" on public.reminders;
create policy "contacts_own" on public.contacts
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
-- Kontak yang dipilih harus milik pengguna yang sama.
create policy "reminders_own" on public.reminders
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (contact_id is null or exists (select 1 from public.contacts c where c.id = contact_id and c.user_id = (select auth.uid())))
  );

revoke all on public.contacts, public.reminders from anon, authenticated;
grant select, insert, update, delete on public.contacts, public.reminders to authenticated;

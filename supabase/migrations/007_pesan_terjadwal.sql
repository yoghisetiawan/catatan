-- Migrasi 007: Pesan Grup (pesan terjadwal ke grup WhatsApp)
--   wa_scheduled  daftar pesan terjadwal milik pengguna: judul, nama grup WhatsApp, isi pesan, jadwal, pengulangan
--
-- Catatan tidak mengirim pesan WhatsApp sendiri. Saat jadwal tiba (selama Catatan terbuka), pengguna diberi alarm
-- dan tombol yang membuka WhatsApp dengan pesan siap kirim. Kolom last_sent_at dan send_count mencatat berapa kali
-- pengguna membuka WhatsApp untuk pesan itu.
--
-- Setiap pengguna hanya dapat mengakses barisnya sendiri (Row Level Security).
-- Jalankan di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

create or replace function public.now_ms()
returns bigint language sql stable set search_path = ''
as $$ select (extract(epoch from now()) * 1000)::bigint $$;

create table if not exists public.wa_scheduled (
  id           uuid    primary key default gen_random_uuid(),
  user_id      uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  title        text    not null check (char_length(title) between 1 and 100),
  group_name   text    not null default '' check (char_length(group_name) <= 80),
  body         text    not null check (char_length(body) between 1 and 1500),
  send_at      bigint  not null,                                   -- jadwal berikutnya (milidetik epoch)
  repeat       text    not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly')),
  active       boolean not null default true,
  last_sent_at bigint,
  send_count   int     not null default 0 check (send_count >= 0),
  created_at   bigint  not null default public.now_ms()
);
create index if not exists wa_scheduled_user_idx on public.wa_scheduled (user_id, active, send_at);

-- Batas jumlah per pengguna (fungsi yang sama dengan migrasi 005; dibuat ulang agar migrasi ini berdiri sendiri).
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
drop trigger if exists wa_scheduled_limit on public.wa_scheduled;
create trigger wa_scheduled_limit before insert on public.wa_scheduled
  for each row execute function public.limit_user_rows(200);

alter table public.wa_scheduled enable row level security;
drop policy if exists "wa_scheduled_own" on public.wa_scheduled;
create policy "wa_scheduled_own" on public.wa_scheduled
  for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

revoke all on public.wa_scheduled from anon, authenticated;
grant select, insert, update, delete on public.wa_scheduled to authenticated;

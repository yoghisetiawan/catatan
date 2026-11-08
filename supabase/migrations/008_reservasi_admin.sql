-- Migrasi 008: manajemen reservasi untuk pemilik tempat (DP, daftar menu, catatan admin)
--   reservations.menu     daftar menu/pesanan yang ditulis pemesan (boleh kosong)
--   reservation_admin     data internal pemilik tempat per reservasi: nominal DP, DP diterima, catatan admin.
--                         HANYA terlihat oleh pemilik tempat; pemesan tidak bisa membacanya.
--   book_table            versi baru dengan parameter p_menu
--   set_reservation_status  kini juga boleh mengembalikan 'confirmed' ke 'pending'
--
-- Jalankan SETELAH 004, di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

-- ───────────────────────────── 1. Kolom menu dan zona waktu
alter table public.reservations add column if not exists menu text not null default '';
-- salinan zona waktu tempat, agar pemesan (yang tidak bisa membaca tabel venues) melihat jam di zona yang benar
alter table public.reservations add column if not exists tz_offset_min int not null default 420 check (tz_offset_min between -720 and 840);
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.reservations'::regclass and conname = 'reservations_menu_len') then
    alter table public.reservations add constraint reservations_menu_len check (char_length(menu) <= 500);
  end if;
end;
$$;

-- ───────────────────────────── 2. Data internal pemilik
create table if not exists public.reservation_admin (
  reservation_id uuid    primary key references public.reservations (id) on delete cascade,
  dp_amount      bigint  not null default 0 check (dp_amount between 0 and 1000000000),
  dp_received    boolean not null default false,
  admin_note     text    not null default '' check (char_length(admin_note) <= 200),
  updated_at     bigint  not null default public.now_ms()
);

alter table public.reservation_admin enable row level security;
drop policy if exists "reservation_admin_owner" on public.reservation_admin;
create policy "reservation_admin_owner" on public.reservation_admin
  for all to authenticated
  using (exists (select 1 from public.reservations r join public.venues v on v.id = r.venue_id
                 where r.id = reservation_id and v.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.reservations r join public.venues v on v.id = r.venue_id
                      where r.id = reservation_id and v.owner_id = (select auth.uid())));
revoke all on public.reservation_admin from anon, authenticated;
grant select, insert, update, delete on public.reservation_admin to authenticated;

-- ───────────────────────────── 3. book_table dengan menu
drop function if exists public.book_table(uuid, uuid, bigint, int, text, text, text);
create or replace function public.book_table(
  p_venue uuid, p_table uuid, p_starts bigint, p_party int, p_name text, p_phone text default '', p_note text default '', p_menu text default ''
)
returns public.reservations language plpgsql security definer set search_path = ''
as $$
declare
  v public.venues;
  t public.venue_tables;
  r public.reservations;
  now_ms bigint := public.now_ms();
  ends bigint;
  tod int;
begin
  if auth.uid() is null then raise exception 'Masuk dulu untuk memesan'; end if;
  select * into v from public.venues where id = p_venue;
  if not found then raise exception 'Tempat tidak ditemukan'; end if;
  -- kunci baris meja agar dua pemesan tidak lolos bersamaan
  select * into t from public.venue_tables where id = p_table and venue_id = p_venue and active for update;
  if not found then raise exception 'Meja tidak tersedia'; end if;
  if p_party is null or p_party < 1 or p_party > t.capacity then raise exception 'Jumlah tamu melebihi kapasitas meja (% orang)', t.capacity; end if;
  if char_length(btrim(coalesce(p_name, ''))) < 2 or char_length(btrim(p_name)) > 40 then raise exception 'Nama harus 2-40 karakter'; end if;
  if char_length(btrim(coalesce(p_menu, ''))) > 500 then raise exception 'Daftar menu maksimal 500 karakter'; end if;
  if p_starts is null or p_starts < now_ms + 5 * 60000 then raise exception 'Waktu harus di masa depan'; end if;
  if p_starts > now_ms + 60::bigint * 86400000 then raise exception 'Maksimal 60 hari ke depan'; end if;
  ends := p_starts + v.slot_min::bigint * 60000;
  tod := (((p_starts + v.tz_offset_min::bigint * 60000) / 60000) % 1440)::int;
  if tod < v.open_min or tod + v.slot_min > v.close_min then raise exception 'Di luar jam buka'; end if;
  if exists (select 1 from public.reservations x
             where x.table_id = p_table and x.status in ('pending', 'confirmed') and x.starts_at < ends and x.ends_at > p_starts) then
    raise exception 'Meja sudah dipesan pada jam itu';
  end if;
  if (select count(*) from public.reservations x
      where x.user_id = auth.uid() and x.status in ('pending', 'confirmed') and x.ends_at > now_ms) >= 5 then
    raise exception 'Maksimal 5 reservasi aktif';
  end if;
  insert into public.reservations (venue_id, table_id, user_id, guest_name, guest_phone, party_size, starts_at, ends_at, note, menu, venue_name, table_name, tz_offset_min, status)
  values (p_venue, p_table, auth.uid(), btrim(p_name), btrim(coalesce(p_phone, '')), p_party, p_starts, ends,
          btrim(coalesce(p_note, '')), btrim(coalesce(p_menu, '')), v.name, t.name, v.tz_offset_min, case when v.auto_confirm then 'confirmed' else 'pending' end)
  returning * into r;
  return r;
end;
$$;
revoke execute on function public.book_table(uuid, uuid, bigint, int, text, text, text, text) from public, anon;
grant execute on function public.book_table(uuid, uuid, bigint, int, text, text, text, text) to authenticated;

-- ───────────────────────────── 4. Status: 'pending' boleh dipulihkan dari 'confirmed'
create or replace function public.set_reservation_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.reservations;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if p_status not in ('pending', 'confirmed', 'cancelled', 'done') then raise exception 'Status tidak valid'; end if;
  select * into r from public.reservations where id = p_id;
  if not found or not exists (select 1 from public.venues v where v.id = r.venue_id and v.owner_id = auth.uid()) then
    raise exception 'Reservasi tidak ditemukan';
  end if;
  if r.status in ('cancelled', 'done') then raise exception 'Reservasi sudah selesai atau dibatalkan'; end if;
  update public.reservations set status = p_status where id = p_id;
end;
$$;
revoke execute on function public.set_reservation_status(uuid, text) from public, anon;
grant execute on function public.set_reservation_status(uuid, text) to authenticated;

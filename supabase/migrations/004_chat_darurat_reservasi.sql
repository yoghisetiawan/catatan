-- Migrasi 004: Chat Room, Pesan Grup, Pesan Darurat, dan Reservasi Meja
--
--   Chat:
--     chat_profiles  nama tampilan pengguna di chat
--     chat_rooms     ruang chat: kind 'room' (terbuka, bisa dicari siapa pun yang login)
--                    atau 'group' (privat, masuk dengan kode undangan)
--     chat_members   anggota tiap ruang
--     chat_messages  pesan; kind 'text' atau 'emergency' (Pesan Darurat, hanya di grup)
--   Reservasi:
--     venues, venue_tables, reservations
--
-- Semua perubahan data lewat fungsi (RPC) yang memeriksa aturan; tabel hanya bisa DIBACA langsung
-- (dilindungi Row Level Security), kecuali venues dan venue_tables yang dikelola pemiliknya.
--
-- Jalankan SETELAH 003, di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

create or replace function public.now_ms()
returns bigint language sql stable set search_path = ''
as $$ select (extract(epoch from now()) * 1000)::bigint $$;


-- ═════════════════════════════ A. CHAT ═════════════════════════════

create table if not exists public.chat_profiles (
  user_id      uuid   primary key default auth.uid() references auth.users (id) on delete cascade,
  display_name text   not null check (char_length(display_name) between 2 and 30),
  updated_at   bigint not null default public.now_ms()
);

create table if not exists public.chat_rooms (
  id          uuid   primary key default gen_random_uuid(),
  kind        text   not null check (kind in ('room', 'group')),
  name        text   not null check (char_length(name) between 2 and 50),
  description text   not null default '' check (char_length(description) <= 200),
  invite_code text   unique check (invite_code is null or invite_code ~ '^[A-Z0-9]{8}$'),
  created_by  uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  created_at  bigint not null default public.now_ms()
);

create table if not exists public.chat_members (
  room_id   uuid   not null references public.chat_rooms (id) on delete cascade,
  user_id   uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  role      text   not null default 'member' check (role in ('owner', 'member')),
  joined_at bigint not null default public.now_ms(),
  primary key (room_id, user_id)
);
create index if not exists chat_members_user_idx on public.chat_members (user_id);

create table if not exists public.chat_messages (
  id          bigint generated always as identity primary key,
  room_id     uuid   not null references public.chat_rooms (id) on delete cascade,
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  sender_name text   not null,
  body        text   not null check (char_length(body) between 1 and 1000),
  kind        text   not null default 'text' check (kind in ('text', 'emergency')),
  lat         double precision check (lat between -90 and 90),
  lng         double precision check (lng between -180 and 180),
  created_at  bigint not null default public.now_ms()
);
create index if not exists chat_messages_room_idx on public.chat_messages (room_id, id desc);
create index if not exists chat_messages_user_idx on public.chat_messages (user_id, created_at desc);

-- Pembantu untuk kebijakan RLS (SECURITY DEFINER agar tidak berputar ke kebijakan tabel yang sama).
create or replace function public.is_chat_member(p_room uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.chat_members m where m.room_id = p_room and m.user_id = auth.uid());
$$;
revoke execute on function public.is_chat_member(uuid) from public, anon;
grant execute on function public.is_chat_member(uuid) to authenticated;

alter table public.chat_profiles enable row level security;
alter table public.chat_rooms    enable row level security;
alter table public.chat_members  enable row level security;
alter table public.chat_messages enable row level security;

drop policy if exists "chat_profiles_own"      on public.chat_profiles;
drop policy if exists "chat_rooms_select"      on public.chat_rooms;
drop policy if exists "chat_members_select_own" on public.chat_members;
drop policy if exists "chat_messages_select"   on public.chat_messages;

create policy "chat_profiles_own" on public.chat_profiles
  for select to authenticated using ((select auth.uid()) = user_id);
-- Ruang terbuka bisa dilihat semua pengguna yang login; grup hanya anggotanya.
create policy "chat_rooms_select" on public.chat_rooms
  for select to authenticated
  using (kind = 'room' or public.is_chat_member(id) or created_by = (select auth.uid()));
create policy "chat_members_select_own" on public.chat_members
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "chat_messages_select" on public.chat_messages
  for select to authenticated using (public.is_chat_member(room_id));

revoke all on public.chat_profiles, public.chat_rooms, public.chat_members, public.chat_messages from anon, authenticated;
grant select on public.chat_profiles, public.chat_rooms, public.chat_members, public.chat_messages to authenticated;

-- ── RPC chat
create or replace function public.set_chat_name(p_name text)
returns void language plpgsql security definer set search_path = ''
as $$
declare n text := btrim(coalesce(p_name, ''));
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if char_length(n) < 2 or char_length(n) > 30 then raise exception 'Nama harus 2-30 karakter'; end if;
  insert into public.chat_profiles (user_id, display_name) values (auth.uid(), n)
  on conflict (user_id) do update set display_name = excluded.display_name, updated_at = public.now_ms();
end;
$$;

create or replace function public.create_chat_room(p_kind text, p_name text, p_description text default '')
returns public.chat_rooms language plpgsql security definer set search_path = ''
as $$
declare
  r public.chat_rooms;
  code text;
  tries int := 0;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if not exists (select 1 from public.chat_profiles where user_id = auth.uid()) then
    raise exception 'Buat nama tampilan dulu';
  end if;
  if p_kind not in ('room', 'group') then raise exception 'Jenis ruang tidak dikenal'; end if;
  if (select count(*) from public.chat_rooms where created_by = auth.uid()) >= 10 then
    raise exception 'Maksimal 10 ruang atau grup buatanmu';
  end if;
  loop
    code := case when p_kind = 'group' then upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text), 1, 8)) end;
    begin
      insert into public.chat_rooms (kind, name, description, invite_code, created_by)
      values (p_kind, btrim(p_name), btrim(coalesce(p_description, '')), code, auth.uid())
      returning * into r;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
  insert into public.chat_members (room_id, user_id, role) values (r.id, auth.uid(), 'owner');
  return r;
end;
$$;

create or replace function public.join_chat_room(p_room uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if not exists (select 1 from public.chat_profiles where user_id = auth.uid()) then
    raise exception 'Buat nama tampilan dulu';
  end if;
  if not exists (select 1 from public.chat_rooms where id = p_room and kind = 'room') then
    raise exception 'Ruang tidak ditemukan';
  end if;
  if (select count(*) from public.chat_members where room_id = p_room) >= 500 then
    raise exception 'Ruang ini sudah penuh';
  end if;
  insert into public.chat_members (room_id, user_id) values (p_room, auth.uid()) on conflict do nothing;
end;
$$;

create or replace function public.join_chat_group(p_code text)
returns public.chat_rooms language plpgsql security definer set search_path = ''
as $$
declare r public.chat_rooms;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if not exists (select 1 from public.chat_profiles where user_id = auth.uid()) then
    raise exception 'Buat nama tampilan dulu';
  end if;
  select * into r from public.chat_rooms where kind = 'group' and invite_code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'Kode undangan tidak valid'; end if;
  if (select count(*) from public.chat_members where room_id = r.id) >= 50 then
    raise exception 'Grup ini sudah penuh (maksimal 50 anggota)';
  end if;
  insert into public.chat_members (room_id, user_id) values (r.id, auth.uid()) on conflict do nothing;
  return r;
end;
$$;

-- Keluar dari ruang. Pemilik yang keluar menghapus ruangnya (beserta semua pesan).
create or replace function public.leave_chat_room(p_room uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if exists (select 1 from public.chat_members where room_id = p_room and user_id = auth.uid() and role = 'owner') then
    delete from public.chat_rooms where id = p_room;
  else
    delete from public.chat_members where room_id = p_room and user_id = auth.uid();
  end if;
end;
$$;

create or replace function public.send_chat_message(
  p_room uuid, p_body text, p_kind text default 'text', p_lat double precision default null, p_lng double precision default null
)
returns public.chat_messages language plpgsql security definer set search_path = ''
as $$
declare
  nm text;
  body text := btrim(coalesce(p_body, ''));
  rk text;
  m public.chat_messages;
  now_ms bigint := public.now_ms();
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  select display_name into nm from public.chat_profiles where user_id = auth.uid();
  if nm is null then raise exception 'Buat nama tampilan dulu'; end if;
  if not public.is_chat_member(p_room) then raise exception 'Kamu bukan anggota ruang ini'; end if;
  if char_length(body) < 1 or char_length(body) > 1000 then raise exception 'Pesan harus 1-1000 karakter'; end if;
  if p_kind not in ('text', 'emergency') then raise exception 'Jenis pesan tidak dikenal'; end if;
  select kind into rk from public.chat_rooms where id = p_room;
  if p_kind = 'emergency' and rk <> 'group' then raise exception 'Pesan darurat hanya untuk grup'; end if;
  if p_kind = 'text' and (p_lat is not null or p_lng is not null) then raise exception 'Lokasi hanya untuk pesan darurat'; end if;
  if (select count(*) from public.chat_messages where user_id = auth.uid() and created_at > now_ms - 30000) >= 20 then
    raise exception 'Terlalu cepat, tunggu sebentar';
  end if;
  if p_kind = 'emergency' and
     (select count(*) from public.chat_messages where user_id = auth.uid() and kind = 'emergency' and created_at > now_ms - 600000) >= 10 then
    raise exception 'Terlalu banyak pesan darurat dalam 10 menit terakhir';
  end if;
  insert into public.chat_messages (room_id, user_id, sender_name, body, kind, lat, lng)
  values (p_room, auth.uid(), nm, body, p_kind, p_lat, p_lng)
  returning * into m;
  return m;
end;
$$;

create or replace function public.delete_chat_message(p_id bigint)
returns void language plpgsql security definer set search_path = ''
as $$
declare m public.chat_messages;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  select * into m from public.chat_messages where id = p_id;
  if not found then return; end if;
  if m.user_id = auth.uid()
     or exists (select 1 from public.chat_members where room_id = m.room_id and user_id = auth.uid() and role = 'owner') then
    delete from public.chat_messages where id = p_id;
  else
    raise exception 'Tidak boleh menghapus pesan ini';
  end if;
end;
$$;

-- Daftar anggota (hanya untuk anggota ruang). Tidak mengembalikan id pengguna.
create or replace function public.chat_room_members(p_room uuid)
returns table (display_name text, role text, joined_at bigint, is_me boolean)
language sql stable security definer set search_path = ''
as $$
  select p.display_name, m.role, m.joined_at, (m.user_id = auth.uid())
  from public.chat_members m
  join public.chat_profiles p on p.user_id = m.user_id
  where m.room_id = p_room and public.is_chat_member(p_room)
  order by m.joined_at;
$$;

-- Jumlah anggota tiap ruang terbuka (untuk daftar pencarian) + ruang milik pengguna.
create or replace function public.chat_room_counts()
returns table (room_id uuid, members bigint)
language sql stable security definer set search_path = ''
as $$
  select r.id, (select count(*) from public.chat_members m where m.room_id = r.id)
  from public.chat_rooms r
  where r.kind = 'room' or public.is_chat_member(r.id);
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'set_chat_name(text)', 'create_chat_room(text,text,text)', 'join_chat_room(uuid)', 'join_chat_group(text)',
    'leave_chat_room(uuid)', 'send_chat_message(uuid,text,text,double precision,double precision)',
    'delete_chat_message(bigint)', 'chat_room_members(uuid)', 'chat_room_counts()'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- Realtime: pesan baru (RLS tetap berlaku: pelanggan hanya menerima pesan ruang yang diikutinya).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'chat_messages') then
    alter publication supabase_realtime add table public.chat_messages;
  end if;
end;
$$;


-- ═════════════════════════ B. RESERVASI MEJA ═════════════════════════

create table if not exists public.venues (
  id            uuid   primary key default gen_random_uuid(),
  owner_id      uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  name          text   not null check (char_length(name) between 2 and 60),
  address       text   not null default '' check (char_length(address) <= 150),
  phone         text   not null default '' check (char_length(phone) <= 30),
  open_min      int    not null default 540  check (open_min between 0 and 1439),   -- menit sejak 00.00 waktu setempat
  close_min     int    not null default 1260 check (close_min between 1 and 1440),
  slot_min      int    not null default 120  check (slot_min between 30 and 480),
  tz_offset_min int    not null default 420  check (tz_offset_min between -720 and 840), -- WIB = +7 jam
  auto_confirm  boolean not null default false,
  created_at    bigint not null default public.now_ms(),
  check (close_min > open_min)
);
create index if not exists venues_owner_idx on public.venues (owner_id);

create table if not exists public.venue_tables (
  id       uuid primary key default gen_random_uuid(),
  venue_id uuid not null references public.venues (id) on delete cascade,
  name     text not null check (char_length(name) between 1 and 20),
  capacity int  not null check (capacity between 1 and 50),
  active   boolean not null default true
);
create index if not exists venue_tables_venue_idx on public.venue_tables (venue_id);

create table if not exists public.reservations (
  id          uuid   primary key default gen_random_uuid(),
  venue_id    uuid   not null references public.venues (id) on delete cascade,
  table_id    uuid   not null references public.venue_tables (id),  -- tanpa cascade: meja yang punya riwayat tidak bisa dihapus (nonaktifkan saja)
  user_id     uuid   not null default auth.uid() references auth.users (id) on delete cascade,
  guest_name  text   not null check (char_length(guest_name) between 2 and 40),
  guest_phone text   not null default '' check (char_length(guest_phone) <= 30),
  party_size  int    not null check (party_size between 1 and 50),
  starts_at   bigint not null,
  ends_at     bigint not null,
  note        text   not null default '' check (char_length(note) <= 200),
  venue_name  text   not null default '',   -- salinan nama saat memesan (pemesan tidak bisa membaca tabel venues)
  table_name  text   not null default '',
  status      text   not null default 'pending' check (status in ('pending', 'confirmed', 'cancelled', 'done')),
  created_at  bigint not null default public.now_ms(),
  check (ends_at > starts_at)
);
create index if not exists reservations_table_time_idx on public.reservations (table_id, starts_at);
create index if not exists reservations_user_idx on public.reservations (user_id, starts_at desc);
create index if not exists reservations_venue_idx on public.reservations (venue_id, starts_at);

alter table public.venues       enable row level security;
alter table public.venue_tables enable row level security;
alter table public.reservations enable row level security;

drop policy if exists "venues_owner_all"       on public.venues;
drop policy if exists "venue_tables_owner_all" on public.venue_tables;
drop policy if exists "reservations_select"    on public.reservations;

create policy "venues_owner_all" on public.venues
  for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "venue_tables_owner_all" on public.venue_tables
  for all to authenticated
  using (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = (select auth.uid())));
-- Pemesan melihat reservasinya sendiri; pemilik tempat melihat semua reservasi tempatnya.
create policy "reservations_select" on public.reservations
  for select to authenticated
  using ((select auth.uid()) = user_id
         or exists (select 1 from public.venues v where v.id = venue_id and v.owner_id = (select auth.uid())));

revoke all on public.venues, public.venue_tables, public.reservations from anon, authenticated;
grant select, insert, update, delete on public.venues, public.venue_tables to authenticated;
grant select on public.reservations to authenticated;

-- Info tempat untuk halaman pemesanan (bisa dibuka tanpa login; hanya data publik).
create or replace function public.get_venue(p_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'venue', jsonb_build_object('id', v.id, 'name', v.name, 'address', v.address, 'phone', v.phone,
             'open_min', v.open_min, 'close_min', v.close_min, 'slot_min', v.slot_min,
             'tz_offset_min', v.tz_offset_min, 'auto_confirm', v.auto_confirm),
    'tables', coalesce((select jsonb_agg(jsonb_build_object('id', t.id, 'name', t.name, 'capacity', t.capacity) order by t.name)
                        from public.venue_tables t where t.venue_id = v.id and t.active), '[]'::jsonb))
  from public.venues v where v.id = p_id;
$$;

-- Jam yang sudah terisi (tanpa data pribadi).
create or replace function public.venue_busy(p_venue uuid, p_from bigint, p_to bigint)
returns table (table_id uuid, starts_at bigint, ends_at bigint)
language sql stable security definer set search_path = ''
as $$
  select r.table_id, r.starts_at, r.ends_at
  from public.reservations r
  where r.venue_id = p_venue and r.status in ('pending', 'confirmed')
    and r.starts_at < p_to and r.ends_at > p_from
    and p_to - p_from <= 31::bigint * 86400000;
$$;

create or replace function public.book_table(
  p_venue uuid, p_table uuid, p_starts bigint, p_party int, p_name text, p_phone text default '', p_note text default ''
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
  insert into public.reservations (venue_id, table_id, user_id, guest_name, guest_phone, party_size, starts_at, ends_at, note, venue_name, table_name, status)
  values (p_venue, p_table, auth.uid(), btrim(p_name), btrim(coalesce(p_phone, '')), p_party, p_starts, ends,
          btrim(coalesce(p_note, '')), v.name, t.name, case when v.auto_confirm then 'confirmed' else 'pending' end)
  returning * into r;
  return r;
end;
$$;

create or replace function public.cancel_reservation(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.reservations;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  select * into r from public.reservations where id = p_id;
  if not found then raise exception 'Reservasi tidak ditemukan'; end if;
  if r.user_id <> auth.uid() and not exists (select 1 from public.venues v where v.id = r.venue_id and v.owner_id = auth.uid()) then
    raise exception 'Bukan reservasimu';
  end if;
  if r.status in ('cancelled', 'done') then raise exception 'Reservasi sudah selesai atau dibatalkan'; end if;
  update public.reservations set status = 'cancelled' where id = p_id;
end;
$$;

create or replace function public.set_reservation_status(p_id uuid, p_status text)
returns void language plpgsql security definer set search_path = ''
as $$
declare r public.reservations;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if p_status not in ('confirmed', 'cancelled', 'done') then raise exception 'Status tidak valid'; end if;
  select * into r from public.reservations where id = p_id;
  if not found or not exists (select 1 from public.venues v where v.id = r.venue_id and v.owner_id = auth.uid()) then
    raise exception 'Reservasi tidak ditemukan';
  end if;
  if r.status in ('cancelled', 'done') then raise exception 'Reservasi sudah selesai atau dibatalkan'; end if;
  update public.reservations set status = p_status where id = p_id;
end;
$$;

revoke execute on function public.get_venue(uuid) from public;
revoke execute on function public.venue_busy(uuid, bigint, bigint) from public;
grant execute on function public.get_venue(uuid) to anon, authenticated;
grant execute on function public.venue_busy(uuid, bigint, bigint) to anon, authenticated;
do $$
declare f text;
begin
  foreach f in array array[
    'book_table(uuid,uuid,bigint,int,text,text,text)', 'cancel_reservation(uuid)', 'set_reservation_status(uuid,text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- Realtime: pemilik tempat melihat reservasi baru langsung.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'reservations') then
    alter publication supabase_realtime add table public.reservations;
  end if;
end;
$$;

-- Migrasi 006: atribut klasifikasi pesan dan gambar di chat
--   chat_attributes   daftar atribut per ruang/grup (mis. "Absen", "Belanja Pasar"), boleh punya pilihan ganda
--   chat_messages     kolom baru: attr, attr_option (klasifikasi pesan) dan image_path (gambar)
--   bucket "chat-images"  gambar pesan; hanya anggota ruang yang bisa melihat dan mengunggah
--
-- Hanya pemilik ruang yang mengelola atribut; semua anggota bisa memakainya saat mengirim pesan.
-- Jalankan SETELAH 004, di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

-- ───────────────────────────── 1. Atribut
create table if not exists public.chat_attributes (
  id         uuid   primary key default gen_random_uuid(),
  room_id    uuid   not null references public.chat_rooms (id) on delete cascade,
  name       text   not null check (char_length(name) between 1 and 40),
  options    text[] not null default '{}' check (cardinality(options) <= 30),
  created_at bigint not null default public.now_ms()
);
create unique index if not exists chat_attributes_room_name_key on public.chat_attributes (room_id, lower(name));

alter table public.chat_attributes enable row level security;
drop policy if exists "chat_attributes_select" on public.chat_attributes;
create policy "chat_attributes_select" on public.chat_attributes
  for select to authenticated using (public.is_chat_member(room_id));
revoke all on public.chat_attributes from anon, authenticated;
grant select on public.chat_attributes to authenticated;

-- ───────────────────────────── 2. Kolom pesan
alter table public.chat_messages add column if not exists attr text;
alter table public.chat_messages add column if not exists attr_option text;
alter table public.chat_messages add column if not exists image_path text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.chat_messages'::regclass and conname = 'chat_messages_attr_len') then
    alter table public.chat_messages
      add constraint chat_messages_attr_len check (
        (attr is null or char_length(attr) between 1 and 40)
        and (attr_option is null or char_length(attr_option) between 1 and 40)
        and (image_path is null or char_length(image_path) <= 200));
  end if;
  -- Pesan boleh hanya berisi gambar (isi teks kosong).
  alter table public.chat_messages drop constraint if exists chat_messages_body_check;
  if not exists (select 1 from pg_constraint where conrelid = 'public.chat_messages'::regclass and conname = 'chat_messages_body_len') then
    alter table public.chat_messages
      add constraint chat_messages_body_len check (
        char_length(body) <= 1000 and (char_length(body) >= 1 or image_path is not null));
  end if;
end;
$$;

-- ───────────────────────────── 3. Fungsi atribut (hanya pemilik ruang)
create or replace function public.chat_is_owner(p_room uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.chat_members m where m.room_id = p_room and m.user_id = auth.uid() and m.role = 'owner');
$$;

create or replace function public.clean_options(p_opts text[])
returns text[] language sql immutable set search_path = ''
as $$
  select coalesce(array_agg(o order by ord), '{}')
  from (select distinct on (lower(btrim(x))) btrim(x) as o, ord
        from unnest(coalesce(p_opts, '{}')) with ordinality as t(x, ord)
        where char_length(btrim(x)) between 1 and 40
        order by lower(btrim(x)), ord) s;
$$;

create or replace function public.add_chat_attribute(p_room uuid, p_name text, p_options text[] default '{}')
returns public.chat_attributes language plpgsql security definer set search_path = ''
as $$
declare a public.chat_attributes;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if not public.chat_is_owner(p_room) then raise exception 'Hanya pemilik ruang yang boleh mengelola atribut'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'Nama atribut harus 1-40 karakter'; end if;
  if (select count(*) from public.chat_attributes where room_id = p_room) >= 40 then raise exception 'Maksimal 40 atribut per ruang'; end if;
  begin
    insert into public.chat_attributes (room_id, name, options)
    values (p_room, btrim(p_name), public.clean_options(p_options)) returning * into a;
  exception when unique_violation then
    raise exception 'Atribut dengan nama itu sudah ada';
  end;
  return a;
end;
$$;

-- Ubah nama dan/atau pilihan. Pesan lama ikut berganti nama atribut.
create or replace function public.update_chat_attribute(p_id uuid, p_name text, p_options text[])
returns public.chat_attributes language plpgsql security definer set search_path = ''
as $$
declare a public.chat_attributes; old_name text;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  select * into a from public.chat_attributes where id = p_id;
  if not found or not public.chat_is_owner(a.room_id) then raise exception 'Atribut tidak ditemukan'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 40 then raise exception 'Nama atribut harus 1-40 karakter'; end if;
  old_name := a.name;
  begin
    update public.chat_attributes set name = btrim(p_name), options = public.clean_options(p_options) where id = p_id returning * into a;
  exception when unique_violation then
    raise exception 'Atribut dengan nama itu sudah ada';
  end;
  if old_name <> a.name then
    update public.chat_messages set attr = a.name where room_id = a.room_id and attr = old_name;
  end if;
  return a;
end;
$$;

-- Hapus atribut: pesan lama tetap ada, hanya kehilangan klasifikasinya.
create or replace function public.delete_chat_attribute(p_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare a public.chat_attributes;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  select * into a from public.chat_attributes where id = p_id;
  if not found or not public.chat_is_owner(a.room_id) then raise exception 'Atribut tidak ditemukan'; end if;
  update public.chat_messages set attr = null, attr_option = null where room_id = a.room_id and attr = a.name;
  delete from public.chat_attributes where id = p_id;
end;
$$;

-- ───────────────────────────── 4. Kirim pesan (versi baru: atribut + gambar)
drop function if exists public.send_chat_message(uuid, text, text, double precision, double precision);
create or replace function public.send_chat_message(
  p_room uuid, p_body text, p_kind text default 'text', p_lat double precision default null, p_lng double precision default null,
  p_attr text default null, p_attr_option text default null, p_image text default null
)
returns public.chat_messages language plpgsql security definer set search_path = ''
as $$
declare
  nm text;
  body text := btrim(coalesce(p_body, ''));
  rk text;
  m public.chat_messages;
  now_ms bigint := public.now_ms();
  attr_row public.chat_attributes;
  attr_name text;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  select display_name into nm from public.chat_profiles where user_id = auth.uid();
  if nm is null then raise exception 'Buat nama tampilan dulu'; end if;
  if not public.is_chat_member(p_room) then raise exception 'Kamu bukan anggota ruang ini'; end if;
  if char_length(body) > 1000 then raise exception 'Pesan harus 1-1000 karakter'; end if;
  if char_length(body) < 1 and p_image is null then raise exception 'Pesan harus 1-1000 karakter'; end if;
  if p_kind not in ('text', 'emergency') then raise exception 'Jenis pesan tidak dikenal'; end if;
  select kind into rk from public.chat_rooms where id = p_room;
  if p_kind = 'emergency' and rk <> 'group' then raise exception 'Pesan darurat hanya untuk grup'; end if;
  if p_kind = 'text' and (p_lat is not null or p_lng is not null) then raise exception 'Lokasi hanya untuk pesan darurat'; end if;
  if p_kind = 'emergency' and (p_attr is not null or p_image is not null) then raise exception 'Pesan darurat tidak bisa diberi atribut atau gambar'; end if;
  if p_attr is not null then
    select * into attr_row from public.chat_attributes where room_id = p_room and lower(name) = lower(btrim(p_attr));
    if not found then raise exception 'Atribut tidak ditemukan'; end if;
    if p_attr_option is not null and not (p_attr_option = any (attr_row.options)) then raise exception 'Pilihan atribut tidak valid'; end if;
    if p_attr_option is null and cardinality(attr_row.options) > 0 then raise exception 'Pilih salah satu opsi untuk atribut ini'; end if;
    attr_name := attr_row.name;
  elsif p_attr_option is not null then
    raise exception 'Pilihan tanpa atribut';
  end if;
  -- gambar harus berada di folder ruang ini dan milik pengirim
  if p_image is not null and p_image !~ ('^' || p_room::text || '/' || auth.uid()::text || '/[A-Za-z0-9._-]{1,80}$') then
    raise exception 'Berkas gambar tidak valid';
  end if;
  if (select count(*) from public.chat_messages where user_id = auth.uid() and created_at > now_ms - 30000) >= 20 then
    raise exception 'Terlalu cepat, tunggu sebentar';
  end if;
  if p_kind = 'emergency' and
     (select count(*) from public.chat_messages where user_id = auth.uid() and kind = 'emergency' and created_at > now_ms - 600000) >= 10 then
    raise exception 'Terlalu banyak pesan darurat dalam 10 menit terakhir';
  end if;
  insert into public.chat_messages (room_id, user_id, sender_name, body, kind, lat, lng, attr, attr_option, image_path)
  values (p_room, auth.uid(), nm, body, p_kind, p_lat, p_lng, attr_name, p_attr_option, p_image)
  returning * into m;
  return m;
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'chat_is_owner(uuid)', 'add_chat_attribute(uuid,text,text[])', 'update_chat_attribute(uuid,text,text[])', 'delete_chat_attribute(uuid)',
    'send_chat_message(uuid,text,text,double precision,double precision,text,text,text)'
  ] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end;
$$;

-- ───────────────────────────── 5. Gambar chat (Storage)
-- File disimpan di <id ruang>/<id pengirim>/<nama berkas>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('chat-images', 'chat-images', false, 5242880, array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Cek akses dari nama folder pertama (aman bila bukan UUID).
create or replace function public.chat_image_member(p_folder text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.is_chat_member(p_folder::uuid) else false end;
$$;
create or replace function public.chat_image_owner(p_folder text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select case when p_folder ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then public.chat_is_owner(p_folder::uuid) else false end;
$$;
revoke execute on function public.chat_image_member(text), public.chat_image_owner(text) from public, anon;
grant execute on function public.chat_image_member(text), public.chat_image_owner(text) to authenticated;

drop policy if exists "chat_images_select" on storage.objects;
drop policy if exists "chat_images_insert" on storage.objects;
drop policy if exists "chat_images_delete" on storage.objects;
create policy "chat_images_select" on storage.objects
  for select to authenticated
  using (bucket_id = 'chat-images' and public.chat_image_member((storage.foldername(name))[1]));
create policy "chat_images_insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chat-images'
              and public.chat_image_member((storage.foldername(name))[1])
              and (storage.foldername(name))[2] = (select auth.uid())::text);
create policy "chat_images_delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chat-images'
         and ((storage.foldername(name))[2] = (select auth.uid())::text or public.chat_image_owner((storage.foldername(name))[1])));

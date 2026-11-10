-- Migrasi 011: teruskan pesan chat beratribut ke WhatsApp lewat Fonnte
--   wa_admins          daftar pengguna yang boleh mengatur penerusan WA (dikelola pemilik aplikasi lewat SQL Editor)
--   chat_wa_config     per ruang: tujuan WA (nomor atau ID grup), aktif/tidak, atribut mana yang diteruskan
--   chat_messages      kolom wa_state / wa_tries: status penerusan tiap pesan
--
-- Kenapa ada wa_admins: kunci Fonnte milik pemilik aplikasi dipakai bersama. Tanpa batas ini, siapa pun yang membuat
-- ruang bisa menyuruh server mengirim WhatsApp ke nomor sembarang memakai kuota Fonnte pemilik.
-- Tujuan WA hanya bisa dibaca pemilik ruang yang juga admin; anggota biasa hanya tahu "pesan ini ikut diteruskan".
--
-- Setelah menjalankan file ini, daftarkan dirimu sebagai admin (ganti emailnya), sekali saja:
--   insert into public.wa_admins (user_id) select id from auth.users where email = 'emailmu@gmail.com' on conflict do nothing;
--
-- Jalankan SETELAH 004 dan 006, di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

-- ───────────────────────────── 1. Admin
create table if not exists public.wa_admins (
  user_id uuid primary key references auth.users (id) on delete cascade
);
alter table public.wa_admins enable row level security; -- tanpa kebijakan: tidak ada akses langsung
revoke all on public.wa_admins from anon, authenticated;

create or replace function public.is_wa_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.wa_admins a where a.user_id = auth.uid());
$$;
revoke execute on function public.is_wa_admin() from public, anon;
grant execute on function public.is_wa_admin() to authenticated;

-- ───────────────────────────── 2. Konfigurasi per ruang
create table if not exists public.chat_wa_config (
  room_id    uuid    primary key references public.chat_rooms (id) on delete cascade,
  target     text    not null check (target ~ '^([0-9]{8,15}|[0-9]{10,25}(-[0-9]{5,15})?@g\.us)$'),
  enabled    boolean not null default true,
  attrs      text[]  not null default '{}' check (cardinality(attrs) <= 40), -- kosong = semua atribut
  updated_by uuid    references auth.users (id) on delete set null,
  updated_at bigint  not null default public.now_ms()
);
alter table public.chat_wa_config enable row level security; -- tanpa kebijakan: hanya lewat fungsi di bawah
revoke all on public.chat_wa_config from anon, authenticated;

-- ───────────────────────────── 3. Status per pesan
alter table public.chat_messages add column if not exists wa_state text;
alter table public.chat_messages add column if not exists wa_tries int not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.chat_messages'::regclass and conname = 'chat_messages_wa_state') then
    alter table public.chat_messages
      add constraint chat_messages_wa_state check (wa_state is null or wa_state in ('sending', 'sent', 'failed'));
  end if;
end;
$$;

-- ───────────────────────────── 4. Fungsi pengaturan
-- Info untuk semua anggota ruang; tujuan WA hanya muncul bagi pemilik ruang yang admin.
create or replace function public.wa_room_info(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.chat_wa_config;
  adm boolean := public.is_wa_admin();
  own boolean := public.chat_is_owner(p_room);
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if not public.is_chat_member(p_room) then raise exception 'Kamu bukan anggota ruang ini'; end if;
  select * into c from public.chat_wa_config where room_id = p_room;
  return jsonb_build_object(
    'admin', adm and own,
    'configured', found,
    'enabled', coalesce(c.enabled, false),
    'attrs', coalesce(to_jsonb(c.attrs), '[]'::jsonb),
    'target', case when adm and own then c.target else null end
  );
end;
$$;
revoke execute on function public.wa_room_info(uuid) from public, anon;
grant execute on function public.wa_room_info(uuid) to authenticated;

create or replace function public.set_wa_config(p_room uuid, p_target text, p_enabled boolean, p_attrs text[] default '{}')
returns void language plpgsql security definer set search_path = ''
as $$
declare
  t text := regexp_replace(lower(btrim(coalesce(p_target, ''))), '[\s+]', '', 'g');
  names text[];
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if not public.is_wa_admin() then raise exception 'Hanya admin aplikasi yang boleh mengatur WhatsApp'; end if;
  if not public.chat_is_owner(p_room) then raise exception 'Hanya pemilik ruang yang boleh mengatur WhatsApp'; end if;
  if position('@' in t) = 0 then t := replace(t, '-', ''); end if; -- nomor: buang tanda minus (ID grup memakainya)
  if t ~ '^0[0-9]{7,14}$' then t := '62' || substr(t, 2); end if; -- 0812… → 62812…
  if t !~ '^([0-9]{8,15}|[0-9]{10,25}(-[0-9]{5,15})?@g\.us)$' then
    raise exception 'Tujuan harus nomor WhatsApp (mis. 0812…) atau ID grup berakhiran @g.us';
  end if;
  -- hanya atribut yang memang ada di ruang ini
  select coalesce(array_agg(a.name order by a.name), '{}') into names
    from public.chat_attributes a
    where a.room_id = p_room and a.name = any (coalesce(p_attrs, '{}'));
  if cardinality(names) <> cardinality(coalesce(p_attrs, '{}')) then raise exception 'Ada atribut yang tidak ditemukan di ruang ini'; end if;
  insert into public.chat_wa_config as c (room_id, target, enabled, attrs, updated_by, updated_at)
  values (p_room, t, coalesce(p_enabled, true), names, auth.uid(), public.now_ms())
  on conflict (room_id) do update
    set target = excluded.target, enabled = excluded.enabled, attrs = excluded.attrs,
        updated_by = excluded.updated_by, updated_at = excluded.updated_at;
end;
$$;
revoke execute on function public.set_wa_config(uuid, text, boolean, text[]) from public, anon;
grant execute on function public.set_wa_config(uuid, text, boolean, text[]) to authenticated;

-- Hapus penerusan WA dari ruang (tidak memerlukan admin: pemilik selalu boleh mematikan).
create or replace function public.clear_wa_config(p_room uuid)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if not public.chat_is_owner(p_room) then raise exception 'Hanya pemilik ruang yang boleh mengatur WhatsApp'; end if;
  delete from public.chat_wa_config where room_id = p_room;
end;
$$;
revoke execute on function public.clear_wa_config(uuid) from public, anon;
grant execute on function public.clear_wa_config(uuid) to authenticated;

-- ───────────────────────────── 5. Fungsi untuk server (api/wa.py memanggilnya atas nama pengguna)
-- Mengklaim satu pesan untuk diteruskan. Menolak bila: bukan pengirimnya, bukan pesan teks beratribut, ruang tidak
-- dikonfigurasi/dimatikan, atribut tidak termasuk, pesan lebih tua dari 10 menit, sudah terkirim, sudah 3 kali gagal,
-- atau pengguna sudah memakai 200 percobaan dalam 24 jam. Mengembalikan data pesan + tujuan untuk server.
create or replace function public.wa_claim(p_message bigint)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  m public.chat_messages;
  c public.chat_wa_config;
  room_name text;
  now_ms bigint := public.now_ms();
  used int;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  select * into m from public.chat_messages where id = p_message for update;
  if not found or m.user_id <> auth.uid() or not public.is_chat_member(m.room_id) then raise exception 'Pesan tidak ditemukan'; end if;
  if m.kind <> 'text' or m.attr is null then raise exception 'Hanya pesan beratribut yang diteruskan'; end if;
  select * into c from public.chat_wa_config where room_id = m.room_id;
  if not found or not c.enabled then raise exception 'Penerusan WhatsApp tidak aktif di ruang ini'; end if;
  if cardinality(c.attrs) > 0 and not (m.attr = any (c.attrs)) then raise exception 'Atribut ini tidak diteruskan ke WhatsApp'; end if;
  if m.created_at < now_ms - 600000 then raise exception 'Pesan terlalu lama untuk diteruskan'; end if;
  if m.wa_state in ('sending', 'sent') then raise exception 'Pesan ini sudah diteruskan'; end if;
  if m.wa_tries >= 3 then raise exception 'Sudah gagal 3 kali; tidak dicoba lagi'; end if;
  select coalesce(sum(wa_tries), 0) into used from public.chat_messages
    where user_id = auth.uid() and created_at > now_ms - 86400000;
  if used >= 200 then raise exception 'Batas penerusan WhatsApp harian tercapai. Coba lagi besok.'; end if;
  update public.chat_messages set wa_state = 'sending', wa_tries = wa_tries + 1 where id = m.id;
  select name into room_name from public.chat_rooms where id = m.room_id;
  return jsonb_build_object(
    'target', c.target, 'room', room_name, 'sender', m.sender_name, 'attr', m.attr,
    'option', m.attr_option, 'body', m.body, 'has_image', m.image_path is not null
  );
end;
$$;
revoke execute on function public.wa_claim(bigint) from public, anon;
grant execute on function public.wa_claim(bigint) to authenticated;

-- Server melaporkan hasil kirim. Hanya berlaku untuk pesan yang sedang 'sending' milik pemanggil.
create or replace function public.wa_mark(p_message bigint, p_ok boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  update public.chat_messages
     set wa_state = case when p_ok then 'sent' else 'failed' end
   where id = p_message and user_id = auth.uid() and wa_state = 'sending';
end;
$$;
revoke execute on function public.wa_mark(bigint, boolean) from public, anon;
grant execute on function public.wa_mark(bigint, boolean) to authenticated;

-- Kirim tes dari panel pengaturan (pemilik ruang yang admin).
create or replace function public.wa_claim_test(p_room uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare c public.chat_wa_config; room_name text;
begin
  if auth.uid() is null then raise exception 'Belum masuk'; end if;
  if not public.is_wa_admin() or not public.chat_is_owner(p_room) then raise exception 'Hanya pemilik ruang yang admin boleh mengirim tes'; end if;
  select * into c from public.chat_wa_config where room_id = p_room;
  if not found then raise exception 'Simpan tujuan WhatsApp dulu'; end if;
  select name into room_name from public.chat_rooms where id = p_room;
  return jsonb_build_object('target', c.target, 'room', room_name);
end;
$$;
revoke execute on function public.wa_claim_test(uuid) from public, anon;
grant execute on function public.wa_claim_test(uuid) to authenticated;

-- Migrasi 002: fitur baru Catatan
--   • sampah otomatis (kolom trashed_at)
--   • berbagi lewat link (kolom share_id + fungsi get_shared_note)
--   • riwayat versi (tabel note_versions + trigger)
--   • lampiran gambar (bucket Storage "attachments" + kebijakan akses)
--   • sinkron realtime (tabel notes masuk publikasi supabase_realtime)
--   • hapus akun (fungsi delete_my_account)
--
-- Jalankan SETELAH schema.sql, di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

-- ───────────────────────────── 1. Kolom baru di notes
alter table public.notes add column if not exists trashed_at bigint;
alter table public.notes add column if not exists share_id uuid;
create unique index if not exists notes_share_id_key on public.notes (share_id) where share_id is not null;


-- ───────────────────────────── 2. Riwayat versi
create table if not exists public.note_versions (
  version_id bigint generated always as identity primary key,
  user_id    uuid   not null,
  note_id    text   not null,
  title      text   not null default '',
  content    text   not null default '',
  created_at bigint not null default (extract(epoch from now()) * 1000)::bigint,
  foreign key (user_id, note_id) references public.notes (user_id, id) on delete cascade
);
create index if not exists note_versions_note_idx on public.note_versions (user_id, note_id, created_at desc);

alter table public.note_versions enable row level security;
drop policy if exists "versions_select_own" on public.note_versions;
drop policy if exists "versions_insert_own" on public.note_versions;
drop policy if exists "versions_delete_own" on public.note_versions;
create policy "versions_select_own" on public.note_versions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "versions_insert_own" on public.note_versions
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "versions_delete_own" on public.note_versions
  for delete to authenticated using ((select auth.uid()) = user_id);
revoke all on public.note_versions from anon;
grant select, insert, delete on public.note_versions to authenticated;

-- Simpan versi lama secara otomatis: paling sering sekali per 10 menit per catatan,
-- maksimal 50 versi per catatan.
create or replace function public.notes_save_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  last_at bigint;
  now_ms  bigint := (extract(epoch from now()) * 1000)::bigint;
begin
  if old.title = '' and old.content = '' then
    return null; -- catatan baru yang masih kosong, tidak perlu disimpan
  end if;

  select max(v.created_at) into last_at
  from public.note_versions v
  where v.user_id = old.user_id and v.note_id = old.id;

  if last_at is null or now_ms - last_at > 10 * 60 * 1000 then
    insert into public.note_versions (user_id, note_id, title, content)
    values (old.user_id, old.id, old.title, old.content);

    delete from public.note_versions
    where version_id in (
      select v.version_id from public.note_versions v
      where v.user_id = old.user_id and v.note_id = old.id
      order by v.created_at desc
      offset 50
    );
  end if;
  return null;
end;
$$;

drop trigger if exists notes_save_version on public.notes;
create trigger notes_save_version
  after update on public.notes
  for each row
  when (old.title is distinct from new.title or old.content is distinct from new.content)
  execute function public.notes_save_version();


-- ───────────────────────────── 3. Berbagi lewat link (hanya baca)
create or replace function public.get_shared_note(p_share_id uuid)
returns table (title text, content text, updated_at bigint, owner_id uuid, note_id text)
language sql
stable
security definer
set search_path = ''
as $$
  select n.title, n.content, n.updated_at, n.user_id, n.id
  from public.notes n
  where n.share_id = p_share_id and not n.trashed
  limit 1;
$$;
revoke execute on function public.get_shared_note(uuid) from public;
grant execute on function public.get_shared_note(uuid) to anon, authenticated;


-- ───────────────────────────── 4. Lampiran gambar (Storage)
-- Bucket privat; file disimpan di <user_id>/<note_id>/<nama-file>.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 5242880,
        array['image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Apakah file ini milik catatan yang sedang dibagikan? (dipakai halaman berbagi)
create or replace function public.is_shared_attachment(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.notes n
    where n.share_id is not null
      and not n.trashed
      and n.user_id::text = (storage.foldername(object_name))[1]
      and n.id = (storage.foldername(object_name))[2]
  );
$$;
revoke execute on function public.is_shared_attachment(text) from public;
grant execute on function public.is_shared_attachment(text) to anon, authenticated;

drop policy if exists "attachments_select_own" on storage.objects;
drop policy if exists "attachments_insert_own" on storage.objects;
drop policy if exists "attachments_update_own" on storage.objects;
drop policy if exists "attachments_delete_own" on storage.objects;
drop policy if exists "attachments_select_shared" on storage.objects;

create policy "attachments_select_own" on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "attachments_insert_own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "attachments_update_own" on storage.objects
  for update to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "attachments_delete_own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy "attachments_select_shared" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'attachments' and public.is_shared_attachment(name));


-- ───────────────────────────── 5. Sinkron realtime
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notes'
  ) then
    alter publication supabase_realtime add table public.notes;
  end if;
end;
$$;


-- ───────────────────────────── 6. Hapus akun sendiri
-- Menghapus pengguna yang sedang masuk; catatan & riwayatnya ikut terhapus (on delete cascade).
-- File lampiran dihapus oleh aplikasi sebelum fungsi ini dipanggil.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Tidak ada pengguna yang masuk';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;

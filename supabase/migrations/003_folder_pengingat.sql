-- Migrasi 003: folder bertingkat dan pengingat
--   • notes.folder_id  : catatan ada di folder mana (kosong = tanpa folder)
--   • notes.remind_at  : waktu pengingat/alarm catatan (milidetik epoch, kosong = tanpa pengingat)
--   • user_folders     : pohon folder milik tiap pengguna (satu baris per pengguna)
--
-- Jalankan SETELAH 002, di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

-- ───────────────────────────── 1. Kolom baru di notes
alter table public.notes add column if not exists folder_id text;
alter table public.notes add column if not exists remind_at bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.notes'::regclass and conname = 'notes_folder_id_format'
  ) then
    alter table public.notes
      add constraint notes_folder_id_format
      check (folder_id is null or folder_id ~ '^[A-Za-z0-9_-]{1,64}$');
  end if;
end;
$$;

create index if not exists notes_remind_idx on public.notes (user_id, remind_at) where remind_at is not null;


-- ───────────────────────────── 2. Pohon folder
-- tree berisi daftar: [{"id": "...", "name": "...", "parent": "<id folder induk atau null>"}]
create table if not exists public.user_folders (
  user_id    uuid   primary key default auth.uid() references auth.users (id) on delete cascade,
  tree       jsonb  not null default '[]'::jsonb
             check (jsonb_typeof(tree) = 'array' and octet_length(tree::text) <= 100000),
  updated_at bigint not null default (extract(epoch from now()) * 1000)::bigint
);

alter table public.user_folders enable row level security;
drop policy if exists "folders_select_own" on public.user_folders;
drop policy if exists "folders_insert_own" on public.user_folders;
drop policy if exists "folders_update_own" on public.user_folders;
drop policy if exists "folders_delete_own" on public.user_folders;
create policy "folders_select_own" on public.user_folders
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "folders_insert_own" on public.user_folders
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "folders_update_own" on public.user_folders
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "folders_delete_own" on public.user_folders
  for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.user_folders from anon;
grant select, insert, update, delete on public.user_folders to authenticated;

-- Skema database aplikasi Catatan untuk Supabase.
-- Jalankan sekali di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

create table if not exists public.notes (
  user_id    uuid    not null default auth.uid() references auth.users (id) on delete cascade,
  id         text    not null check (id ~ '^[A-Za-z0-9_-]{1,64}$'),
  title      text    not null default '' check (char_length(title) <= 140),
  content    text    not null default '' check (octet_length(content) <= 1000000),
  tags       text[]  not null default '{}' check (cardinality(tags) <= 20),
  color      text    not null default '' check (color ~ '^(#[0-9a-fA-F]{6})?$'),
  pinned     boolean not null default false,
  trashed    boolean not null default false,
  created_at bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  updated_at bigint  not null default (extract(epoch from now()) * 1000)::bigint,
  primary key (user_id, id)
);

create index if not exists notes_user_updated_idx on public.notes (user_id, updated_at desc);

-- Row Level Security: setiap pengguna hanya bisa mengakses catatannya sendiri.
alter table public.notes enable row level security;

drop policy if exists "notes_select_own" on public.notes;
drop policy if exists "notes_insert_own" on public.notes;
drop policy if exists "notes_update_own" on public.notes;
drop policy if exists "notes_delete_own" on public.notes;

create policy "notes_select_own" on public.notes
  for select to authenticated
  using ((select auth.uid()) = user_id);

create policy "notes_insert_own" on public.notes
  for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy "notes_update_own" on public.notes
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "notes_delete_own" on public.notes
  for delete to authenticated
  using ((select auth.uid()) = user_id);

-- Pengguna anonim tidak boleh menyentuh tabel ini sama sekali.
revoke all on public.notes from anon;
grant select, insert, update, delete on public.notes to authenticated;

-- Last-write-wins: abaikan pembaruan yang lebih lama dari versi di database
-- (misalnya dari perangkat lain yang belum dimuat ulang).
create or replace function public.notes_skip_stale_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.updated_at < old.updated_at then
    return null; -- lewati baris ini, versi di database lebih baru
  end if;
  new.user_id := old.user_id;       -- pemilik tidak bisa diganti
  new.created_at := old.created_at; -- tanggal dibuat tidak berubah
  return new;
end;
$$;

drop trigger if exists notes_skip_stale_update on public.notes;
create trigger notes_skip_stale_update
  before update on public.notes
  for each row execute function public.notes_skip_stale_update();

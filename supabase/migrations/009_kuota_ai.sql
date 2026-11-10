-- Migrasi 009: kuota pemakaian AI per pengguna per hari
--   ai_usage         jumlah permintaan AI tiap pengguna per hari (UTC). Tidak bisa dibaca atau ditulis langsung.
--   ai_take_quota()  dipanggil server (api/ai.py) atas nama pengguna sebelum memanggil layanan AI:
--                    menambah hitungan hari ini dan menolak bila melewati batas.
--
-- Tujuan: biaya pemakaian AI (kunci API milik pemilik aplikasi) tidak bisa membengkak oleh satu pengguna.
-- Jalankan di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

create table if not exists public.ai_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  day     date not null default ((now() at time zone 'utc')::date),
  count   int  not null default 0 check (count >= 0),
  primary key (user_id, day)
);

alter table public.ai_usage enable row level security; -- tanpa kebijakan: tidak ada akses langsung
revoke all on public.ai_usage from anon, authenticated;

create or replace function public.ai_take_quota(p_limit int default 40)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  c int;
  lim int := least(greatest(coalesce(p_limit, 40), 1), 1000);
begin
  if auth.uid() is null then
    raise exception 'Belum masuk';
  end if;
  insert into public.ai_usage as u (user_id, day, count)
  values (auth.uid(), (now() at time zone 'utc')::date, 1)
  on conflict (user_id, day) do update set count = u.count + 1
  returning u.count into c;
  if c > lim then
    raise exception 'Batas pemakaian AI harian tercapai (% per hari). Coba lagi besok.', lim; -- membatalkan penambahan tadi
  end if;
  delete from public.ai_usage where user_id = auth.uid() and day < (now() at time zone 'utc')::date - 30;
  return lim - c; -- sisa kuota hari ini
end;
$$;
revoke execute on function public.ai_take_quota(int) from public, anon;
grant execute on function public.ai_take_quota(int) to authenticated;

-- Migrasi 010: teks asli rekaman
--   notes.voice_original  ucapan mentah sebelum dirapikan AI, ditampilkan di bagian lipat "Teks Asli Rekaman".
--   Hanya terlihat oleh pemilik catatan (RLS tabel notes yang sudah ada berlaku).
--
-- Jalankan di: Supabase Dashboard → SQL Editor → New query → tempel → Run.
-- Aman dijalankan ulang.

alter table public.notes add column if not exists voice_original text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.notes'::regclass and conname = 'notes_voice_original_len') then
    alter table public.notes
      add constraint notes_voice_original_len check (voice_original is null or char_length(voice_original) <= 20000);
  end if;
end;
$$;

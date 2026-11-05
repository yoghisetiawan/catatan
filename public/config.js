// Konfigurasi Supabase.
// Ambil dari: Supabase Dashboard → Project Settings → API (atau "API Keys").
//
// supabaseAnonKey = kunci "anon" / "publishable" (sb_publishable_…).
// Kunci ini memang aman berada di browser karena data dilindungi Row Level Security.
// JANGAN PERNAH menaruh kunci "service_role" / "secret" (sb_secret_…) di sini.
window.CATATAN_CONFIG = {
  supabaseUrl: "https://tgztswbgnhevyxaxbawz.supabase.co", // project: tgztswbgnhevyxaxbawz (ap-southeast-1)
  supabaseAnonKey: "sb_publishable_uqOMK71cFfxzjreWMfVPfA_ZDstaYYU",  // contoh: "sb_publishable_…" atau "eyJhbGciOi…"
};

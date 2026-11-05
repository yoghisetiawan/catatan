// Terapkan tema (terang/gelap) pada halaman statis seperti Kebijakan Privasi dan Ketentuan Layanan.
(() => {
  let theme = null;
  try {
    theme = (JSON.parse(localStorage.getItem("catatan.prefs.v1") || "{}") || {}).theme;
  } catch {
    /* abaikan */
  }
  document.documentElement.dataset.theme = theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
})();

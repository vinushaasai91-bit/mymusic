// ============================================================
// Lyrics Vault — Supabase client bootstrap
// ============================================================
(function () {
  const cfg = window.LYRICS_VAULT_CONFIG;

  if (!cfg || cfg.SUPABASE_URL.includes("YOUR-PROJECT-REF")) {
    console.warn(
      "[Lyrics Vault] Supabase is not configured yet. Edit js/config.js with your project URL and anon key."
    );
  }

  window.supabaseClient = window.supabase.createClient(
    cfg.SUPABASE_URL,
    cfg.SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );
})();

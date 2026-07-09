/ ============================================================
// Lyrics Vault — Configuration
// Paste your Supabase project values below. Find them at:
// Supabase Dashboard → Project Settings → API
// ============================================================
window.LYRICS_VAULT_CONFIG = {
  SUPABASE_URL: "https://khoudjwrgmfyxzxzteeu.supabase.co",
  SUPABASE_ANON_KEY: "sb_publishable_SgS1Hn7dEG7iwHm4YQDhIA_BqnMMvWC",
 
  // Storage bucket name (must match sql/schema.sql)
  BUCKET: "lyrics-images",
 
  // Max upload size in bytes (10 MB default)
  MAX_IMAGE_BYTES: 10 * 1024 * 1024,
 
  // Allowed image types
  ALLOWED_TYPES: ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"],
 
  // Days an archived (soft-deleted) lyric is kept before it's eligible for permanent removal
  ARCHIVE_RETENTION_DAYS: 30
};
 

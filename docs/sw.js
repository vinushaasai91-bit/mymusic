// ============================================================
// Lyrics Vault — Service worker
// Caches the app shell so the UI (not your data) loads offline.
// ============================================================
const CACHE_NAME = "lyrics-vault-shell-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./css/style.css",
  "./js/config.js",
  "./js/supabase-client.js",
  "./js/auth.js",
  "./js/db.js",
  "./js/ocr.js",
  "./js/ui.js",
  "./js/app.js",
  "./manifest.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_FILES)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first for Supabase API/data calls, cache-first for the app shell.
self.addEventListener("fetch", (event) => {
  const url = event.request.url;
  const isDataCall = url.includes("supabase.co") || url.includes("qrserver.com");
  if (isDataCall) return; // let these pass straight through to the network

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).catch(() => cached))
  );
});

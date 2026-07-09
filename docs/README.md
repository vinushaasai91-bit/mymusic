# Lyrics Vault

A private, personal vault for song lyrics you only have as photos or handwritten notes.
Upload an image, it gets OCR'd in your browser, and everything is saved to your own
Supabase project — searchable, favoritable, and organized into collections.

Glassmorphism UI · Purple + Cyan · Poppins + Inter · installable as a PWA.

---

## 1. Create your Supabase project

1. Go to [supabase.com](https://supabase.com) → **New project**.
2. Wait for it to finish provisioning (~2 minutes).

## 2. Run the database schema

1. In your project, open **SQL Editor → New query**.
2. Paste the entire contents of `sql/schema.sql` from this project and click **Run**.
   This creates the `lyrics` table, enables Row Level Security, adds policies so
   only you can ever read/write your own rows, and creates the `lyrics-images`
   storage bucket with matching storage policies.

## 3. Set up authentication (single account)

1. Go to **Authentication → Users → Add user** and create your own account
   (email + password). Confirm the email if required.
2. Optional but recommended, since this is a personal vault:
   **Authentication → Providers → Email** → turn **off** "Allow new users to sign up".
   This stops anyone else from ever creating an account on your project.

## 4. Get your API keys

Go to **Project Settings → API**. You'll need:

- **Project URL**
- **anon public** key (never use the `service_role` key in this app)

## 5. Configure the app

Open `js/config.js` and replace the placeholders:

```js
window.LYRICS_VAULT_CONFIG = {
  SUPABASE_URL: "https://your-project-ref.supabase.co",
  SUPABASE_ANON_KEY: "your-public-anon-key",
  ...
};
```

That's it — no build step, no npm install. It's plain HTML/CSS/JS.

## 6. Run it locally

Because the app uses `fetch`/ES modules-style calls, serve it over HTTP rather than
opening the file directly:

```bash
cd lyrics-vault
python3 -m http.server 8080
# then open http://localhost:8080
```

Or use the VS Code "Live Server" extension, or `npx serve`.

## 7. Enable OCR

Nothing to configure — OCR runs fully client-side via **Tesseract.js**, loaded from
a CDN in `index.html`. The first OCR run in a session downloads the language model
(~2–4 MB) and caches it in the browser; after that it's instant. Progress is shown
live while it scans, and you can always edit or re-run it from the Add/Edit form.

## 8. Deploy

Any static host works, since there's no server/build step.

**Netlify**
```bash
netlify deploy --prod --dir=.
```
Or drag-and-drop the `lyrics-vault` folder onto [app.netlify.com/drop](https://app.netlify.com/drop).

**Vercel**
```bash
vercel --prod
```

**GitHub Pages**
1. Push this folder to a GitHub repo.
2. Repo → **Settings → Pages** → Source: `main` branch, `/ (root)`.
3. Your app will be live at `https://<username>.github.io/<repo>/`.

> After deploying, add the deployed URL to Supabase under
> **Authentication → URL Configuration → Site URL / Redirect URLs** so password-reset
> links work correctly.

## 9. Install as an app

Once deployed and opened over HTTPS, your browser will offer "Install app" /
"Add to Home Screen" — this uses `manifest.json` and `sw.js` (already included) to
give you an offline-capable app icon on desktop or mobile. Only the app shell is
cached offline; your lyrics themselves need a connection to load from Supabase.

---

## What's included

- **Auth** — email/password sign-in, password reset via email, persistent sessions,
  protected app shell, single-account setup.
- **Add lyrics** — drag & drop, click-to-browse, or camera capture on mobile;
  automatic image compression before upload; OCR with live progress; editable
  extracted text; duplicate-detection warning based on OCR text similarity;
  auto-suggested title from the first OCR line.
- **Organize** — tags, collections (folders), favorites, star ratings, pin-to-top,
  rich-text notes (bold/italic/lists/links).
- **Find things** — instant debounced search across title/artist/OCR text/notes/
  album/genre/tags, with match highlighting and basic `AND`/`OR`/`"phrase"` syntax;
  filters for language, genre, rating, and sort order.
- **Browse** — dashboard, Pinterest-style gallery with grid/list/large/small density,
  favorites page, collections-as-folders, a stats dashboard (totals, languages,
  artists, genres, top tags, monthly uploads chart).
- **Detail view** — full image with tap-to-zoom fullscreen, swipe left/right to move
  between lyrics, edit, delete, download image, copy lyrics, generate a private
  share link, generate a QR code for that link.
- **Bulk actions** — multi-select mode for bulk delete (to Archive) and bulk tagging.
- **Archive** — soft delete with 30-day recovery window, restore or permanently delete.
- **Backup** — export your whole vault as JSON, import a JSON backup back in.
- **Polish** — dark/light/auto theme, loading skeletons, toasts, empty states,
  keyboard shortcuts (`/` search, `n` new lyric, `Esc` close), bottom nav + pull-to-
  refresh on mobile, installable PWA with offline app shell.

## Notes & limits

- Images are stored publicly-readable-by-URL in the `lyrics-images` bucket for
  simplicity (so `<img>` tags load fast without signed URLs), but the storage
  **policies** still restrict uploading/listing/deleting to your own folder —
  someone would need the exact random file URL to view a single image.
  If you'd rather have fully private images, switch the bucket to private and
  swap `getPublicUrl` for `createSignedUrl` in `js/db.js`.
- "Share link" opens the app to that lyric's ID — since Row Level Security only
  allows the owner to read their rows, the link only works when *you* are
  signed in on the device that opens it.
- The archive uses soft delete (`deleted_at`); nothing is auto-purged after 30
  days by itself — use the "Delete forever" button, or add a Supabase scheduled
  function if you want automatic purging.

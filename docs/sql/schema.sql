-- ============================================================
-- Lyrics Vault — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Required for gen_random_uuid()
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- Table: lyrics
-- ------------------------------------------------------------
create table if not exists public.lyrics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title           text not null default 'Untitled',
  artist          text default '',
  language        text default '',
  album           text default '',
  genre           text default '',
  mood            text default '',
  tags            text[] default '{}',
  collections     text[] default '{}',
  notes           text default '',
  image_url       text,
  image_path      text,
  extracted_text  text default '',
  ocr_confidence  numeric,
  favorite        boolean default false,
  pinned          boolean default false,
  color_label     text,
  rating          int check (rating between 0 and 5) default 0,
  date_added      timestamptz not null default now(),
  last_updated    timestamptz not null default now(),
  deleted_at      timestamptz  -- soft delete / archive bin (30-day recovery)
);

-- Keep last_updated fresh
create or replace function public.set_last_updated()
returns trigger as $$
begin
  new.last_updated = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_lyrics_updated on public.lyrics;
create trigger trg_lyrics_updated
before update on public.lyrics
for each row execute function public.set_last_updated();

-- Helpful indexes
create index if not exists idx_lyrics_user on public.lyrics(user_id);
create index if not exists idx_lyrics_favorite on public.lyrics(favorite);
create index if not exists idx_lyrics_deleted on public.lyrics(deleted_at);
create index if not exists idx_lyrics_search on public.lyrics
  using gin (to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(artist,'') || ' ' ||
    coalesce(extracted_text,'') || ' ' || coalesce(notes,'') || ' ' ||
    coalesce(album,'') || ' ' || coalesce(genre,'')));

-- ------------------------------------------------------------
-- Row Level Security — a user can only ever touch their own rows
-- ------------------------------------------------------------
alter table public.lyrics enable row level security;

drop policy if exists "select own lyrics" on public.lyrics;
create policy "select own lyrics"
  on public.lyrics for select
  using (auth.uid() = user_id);

drop policy if exists "insert own lyrics" on public.lyrics;
create policy "insert own lyrics"
  on public.lyrics for insert
  with check (auth.uid() = user_id);

drop policy if exists "update own lyrics" on public.lyrics;
create policy "update own lyrics"
  on public.lyrics for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "delete own lyrics" on public.lyrics;
create policy "delete own lyrics"
  on public.lyrics for delete
  using (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Storage bucket: lyrics-images
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('lyrics-images', 'lyrics-images', true)
on conflict (id) do nothing;

-- Only the owner (folder named after their user id) may read/write/delete.
-- Files must be uploaded as: {user_id}/{filename}
drop policy if exists "lyrics-images select own" on storage.objects;
create policy "lyrics-images select own"
  on storage.objects for select
  using (bucket_id = 'lyrics-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "lyrics-images insert own" on storage.objects;
create policy "lyrics-images insert own"
  on storage.objects for insert
  with check (bucket_id = 'lyrics-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "lyrics-images update own" on storage.objects;
create policy "lyrics-images update own"
  on storage.objects for update
  using (bucket_id = 'lyrics-images' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "lyrics-images delete own" on storage.objects;
create policy "lyrics-images delete own"
  on storage.objects for delete
  using (bucket_id = 'lyrics-images' and (storage.foldername(name))[1] = auth.uid()::text);

-- ------------------------------------------------------------
-- Lock signups down to a single account (personal vault)
-- Run this AFTER you create your one account in Authentication → Users,
-- if you want to fully disable public sign-up from the dashboard UI:
--   Authentication → Providers → Email → toggle "Allow new users to sign up" OFF
-- (No SQL needed for this step — it's a dashboard toggle.)
-- ------------------------------------------------------------

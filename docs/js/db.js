// ============================================================
// Lyrics Vault — Data layer (Supabase table + storage)
// ============================================================
const DB = (() => {
  const cfg = window.LYRICS_VAULT_CONFIG;
  const TABLE = "lyrics";

  // ---------- Reads ----------
  async function listActive() {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select("*")
      .is("deleted_at", null)
      .order("pinned", { ascending: false })
      .order("date_added", { ascending: false });
    if (error) throw error;
    return data;
  }

  async function listArchived() {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .select("*")
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false });
    if (error) throw error;
    return data;
  }

  async function getById(id) {
    const { data, error } = await supabaseClient.from(TABLE).select("*").eq("id", id).single();
    if (error) throw error;
    return data;
  }

  // ---------- Writes ----------
  async function create(record) {
    const user = Auth.getUser();
    const payload = { ...record, user_id: user.id };
    const { data, error } = await supabaseClient.from(TABLE).insert(payload).select().single();
    if (error) throw error;
    return data;
  }

  async function update(id, patch) {
    const { data, error } = await supabaseClient
      .from(TABLE)
      .update(patch)
      .eq("id", id)
      .select()
      .single();
    if (error) throw error;
    return data;
  }

  async function softDelete(id) {
    return update(id, { deleted_at: new Date().toISOString() });
  }

  async function restore(id) {
    return update(id, { deleted_at: null });
  }

  async function hardDelete(id, imagePath) {
    if (imagePath) {
      await supabaseClient.storage.from(cfg.BUCKET).remove([imagePath]);
    }
    const { error } = await supabaseClient.from(TABLE).delete().eq("id", id);
    if (error) throw error;
  }

  async function toggleFavorite(id, favorite) {
    return update(id, { favorite });
  }

  async function bulkDeleteSoft(ids) {
    const { error } = await supabaseClient
      .from(TABLE)
      .update({ deleted_at: new Date().toISOString() })
      .in("id", ids);
    if (error) throw error;
  }

  async function bulkAddTag(ids, tag) {
    // fetch current tags then merge (simple approach for small personal vaults)
    const { data, error } = await supabaseClient.from(TABLE).select("id, tags").in("id", ids);
    if (error) throw error;
    for (const row of data) {
      const tags = new Set(row.tags || []);
      tags.add(tag);
      await supabaseClient.from(TABLE).update({ tags: Array.from(tags) }).eq("id", row.id);
    }
  }

  // ---------- Storage ----------
  async function uploadImage(file) {
    const user = Auth.getUser();
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${user.id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabaseClient.storage.from(cfg.BUCKET).upload(path, file, {
      cacheControl: "3600",
      upsert: false
    });
    if (error) throw error;
    const { data: pub } = supabaseClient.storage.from(cfg.BUCKET).getPublicUrl(path);
    return { url: pub.publicUrl, path };
  }

  // ---------- Stats ----------
  function computeStats(rows) {
    const langs = new Set(), artists = new Set(), genres = new Set();
    const tagCounts = {};
    const monthly = {};
    let favorites = 0;

    rows.forEach((r) => {
      if (r.language) langs.add(r.language);
      if (r.artist) artists.add(r.artist);
      if (r.genre) genres.add(r.genre);
      if (r.favorite) favorites++;
      (r.tags || []).forEach((t) => (tagCounts[t] = (tagCounts[t] || 0) + 1));
      const d = new Date(r.date_added);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      monthly[key] = (monthly[key] || 0) + 1;
    });

    const topTags = Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    return {
      total: rows.length,
      favorites,
      languages: langs.size,
      artists: artists.size,
      genres: genres.size,
      topTags,
      monthly
    };
  }

  // ---------- Duplicate detection ----------
  // Lightweight Jaccard similarity over word sets of OCR text
  function similarity(a, b) {
    const setA = new Set((a || "").toLowerCase().match(/[a-z0-9']+/g) || []);
    const setB = new Set((b || "").toLowerCase().match(/[a-z0-9']+/g) || []);
    if (setA.size === 0 || setB.size === 0) return 0;
    let intersection = 0;
    setA.forEach((w) => { if (setB.has(w)) intersection++; });
    const union = setA.size + setB.size - intersection;
    return intersection / union;
  }

  function findLikelyDuplicates(newText, existingRows, threshold = 0.55) {
    return existingRows
      .map((r) => ({ row: r, score: similarity(newText, r.extracted_text) }))
      .filter((x) => x.score >= threshold)
      .sort((a, b) => b.score - a.score);
  }

  // ---------- Export / Import ----------
  function exportJSON(rows) {
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lyrics-vault-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function importJSON(rows) {
    const user = Auth.getUser();
    const cleaned = rows.map((r) => {
      const { id, user_id, ...rest } = r;
      return { ...rest, user_id: user.id };
    });
    const { error } = await supabaseClient.from(TABLE).insert(cleaned);
    if (error) throw error;
  }

  return {
    listActive, listArchived, getById,
    create, update, softDelete, restore, hardDelete, toggleFavorite,
    bulkDeleteSoft, bulkAddTag,
    uploadImage,
    computeStats,
    similarity, findLikelyDuplicates,
    exportJSON, importJSON
  };
})();

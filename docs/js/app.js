// ============================================================
// Lyrics Vault — App controller
// ============================================================
(function () {
  "use strict";

  // ---------------------------------------------------------
  // State
  // ---------------------------------------------------------
  const state = {
    rows: [],          // active lyrics
    archived: [],       // soft-deleted lyrics
    view: "dashboard",  // dashboard | gallery | favorites | collections | stats | archive | settings
    query: "",
    filters: { language: "", genre: "", rating: "", sort: "recent", favoritesOnly: false, density: "" },
    activeCollection: null,
    selectMode: false,
    selected: new Set(),
    editingId: null,
    pendingImage: null,  // { file, url, path, compressedFile }
    detailListSnapshot: [], // current filtered list for swipe navigation
    detailIndex: -1
  };

  const $ = (id) => document.getElementById(id);
  const qs = (sel, root = document) => root.querySelector(sel);
  const qsa = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  // ---------------------------------------------------------
  // Init
  // ---------------------------------------------------------
  window.addEventListener("DOMContentLoaded", () => {
    applyStoredTheme();
    wireAuthForms();
    handlePasswordRecoveryLink();

    Auth.init(async (user) => {
      if (user) {
        $("login-view").classList.add("hidden");
        $("app-view").classList.remove("hidden");
        $("account-email").textContent = "Signed in as " + user.email;
        await loadAll();
        wireAppOnce();
        routeTo(state.view);
        maybeOpenSharedLyric();
      } else {
        $("app-view").classList.add("hidden");
        $("login-view").classList.remove("hidden");
      }
    });

    registerServiceWorker();
  });

  // ---------------------------------------------------------
  // Auth screen wiring
  // ---------------------------------------------------------
  function wireAuthForms() {
    $("login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAuthError();
      const btn = $("login-submit");
      btn.disabled = true; btn.textContent = "Signing in...";
      try {
        await Auth.signIn($("login-email").value.trim(), $("login-password").value);
      } catch (err) {
        showAuthError(err.message || "Could not sign in.");
      } finally {
        btn.disabled = false; btn.textContent = "Sign in";
      }
    });

    $("reset-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAuthError();
      try {
        await Auth.sendPasswordReset($("reset-email").value.trim());
        UI.toast("Reset link sent — check your inbox.", "success");
      } catch (err) {
        showAuthError(err.message || "Could not send reset email.");
      }
    });

    $("newpass-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAuthError();
      try {
        await Auth.updatePassword($("newpass-1").value);
        UI.toast("Password updated. You're signed in.", "success");
        $("newpass-form").classList.add("hidden");
        $("login-form").classList.remove("hidden");
      } catch (err) {
        showAuthError(err.message || "Could not update password.");
      }
    });

    $("show-reset").addEventListener("click", () => {
      $("login-form").classList.add("hidden");
      $("reset-form").classList.remove("hidden");
      $("show-reset").classList.add("hidden");
      $("show-login").classList.remove("hidden");
      $("auth-title").textContent = "Reset password";
      $("auth-sub").textContent = "We'll email you a secure link";
    });
    $("show-login").addEventListener("click", () => {
      $("reset-form").classList.add("hidden");
      $("login-form").classList.remove("hidden");
      $("show-login").classList.add("hidden");
      $("show-reset").classList.remove("hidden");
      $("auth-title").textContent = "Welcome back";
      $("auth-sub").textContent = "Sign in to your personal lyrics vault";
    });
  }

  function showAuthError(msg) { const e = $("auth-error"); e.textContent = msg; e.classList.remove("hidden"); }
  function hideAuthError() { $("auth-error").classList.add("hidden"); }

  function handlePasswordRecoveryLink() {
    if (window.location.search.includes("reset=1") || window.location.hash.includes("type=recovery")) {
      $("login-form").classList.add("hidden");
      $("newpass-form").classList.remove("hidden");
      $("auth-title").textContent = "Set a new password";
      $("auth-sub").textContent = "Choose a new password for your vault";
    }
  }

  function maybeOpenSharedLyric() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("lyric");
    if (id) openDetail(id);
  }

  // ---------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------
  async function loadAll() {
    UI.skeletonGrid($("grid-target"));
    try {
      state.rows = await DB.listActive();
    } catch (err) {
      UI.toast("Could not load your vault: " + err.message, "error");
      state.rows = [];
    }
    populateFilterOptions();
    renderCurrentView();
  }

  async function refreshArchive() {
    try { state.archived = await DB.listArchived(); } catch (e) { state.archived = []; }
  }

  function populateFilterOptions() {
    const langs = new Set(), genres = new Set();
    state.rows.forEach((r) => { if (r.language) langs.add(r.language); if (r.genre) genres.add(r.genre); });
    fillSelect($("filter-language"), langs, "Language");
    fillSelect($("filter-genre"), genres, "Genre");
  }
  function fillSelect(select, values, placeholder) {
    const current = select.value;
    select.innerHTML = `<option value="">${placeholder}</option>` +
      Array.from(values).sort().map((v) => `<option value="${UI.escapeHtml(v)}">${UI.escapeHtml(v)}</option>`).join("");
    select.value = current;
  }

  // ---------------------------------------------------------
  // App-wide wiring (only once)
  // ---------------------------------------------------------
  let wired = false;
  function wireAppOnce() {
    if (wired) return;
    wired = true;

    // Navigation
    qsa(".nav-item, .bn-item").forEach((el) => {
      el.addEventListener("click", () => routeTo(el.dataset.view));
    });

    $("logout-btn").addEventListener("click", () => Auth.signOut());

    // Theme switch
    qsa(".theme-switch button").forEach((btn) => {
      btn.addEventListener("click", () => setTheme(btn.dataset.themeChoice));
    });

    // Search
    let searchTimer;
    $("search-input").addEventListener("input", (e) => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.query = e.target.value.trim(); renderCurrentView(); }, 180);
    });

    // Filters
    ["filter-language", "filter-genre", "filter-rating", "filter-sort", "view-density"].forEach((id) => {
      $(id).addEventListener("change", () => {
        state.filters.language = $("filter-language").value;
        state.filters.genre = $("filter-genre").value;
        state.filters.rating = $("filter-rating").value;
        state.filters.sort = $("filter-sort").value;
        state.filters.density = $("view-density").value;
        renderCurrentView();
      });
    });
    $("chip-favorites").addEventListener("click", () => {
      state.filters.favoritesOnly = !state.filters.favoritesOnly;
      $("chip-favorites").classList.toggle("active", state.filters.favoritesOnly);
      renderCurrentView();
    });

    // Add lyric
    $("fab-add").addEventListener("click", () => openEditor());
    $("random-btn").addEventListener("click", randomLyric);

    // Select mode
    $("select-mode-btn").addEventListener("click", toggleSelectMode);
    $("bulk-cancel-btn").addEventListener("click", toggleSelectMode);
    $("bulk-delete-btn").addEventListener("click", bulkDelete);
    $("bulk-tag-btn").addEventListener("click", bulkTagPrompt);

    // Grid delegation (dashboard/gallery/favorites/collections/archive)
    ["grid-target", "collections-grid", "archive-grid"].forEach((id) => {
      $(id).addEventListener("click", onGridClick);
    });

    // Editor modal
    wireEditorModal();
    // Detail modal
    wireDetailModal();
    // Confirm/info modal generic close
    $("info-close").addEventListener("click", () => $("info-modal").classList.add("hidden"));
    $("confirm-no").addEventListener("click", () => $("confirm-modal").classList.add("hidden"));

    // Settings
    $("export-btn").addEventListener("click", async () => {
      const all = [...state.rows, ...(await DB.listArchived())];
      DB.exportJSON(all);
      UI.toast("Backup downloaded.", "success");
    });
    $("import-file").addEventListener("change", async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await DB.importJSON(Array.isArray(data) ? data : [data]);
        UI.toast("Backup imported.", "success");
        await loadAll();
      } catch (err) {
        UI.toast("Import failed: " + err.message, "error");
      }
      e.target.value = "";
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
      const typing = ["INPUT", "TEXTAREA"].includes(document.activeElement.tagName) || document.activeElement.isContentEditable;
      if (e.key === "/" && !typing) { e.preventDefault(); $("search-input").focus(); }
      if (e.key === "n" && !typing) { e.preventDefault(); openEditor(); }
      if (e.key === "Escape") closeAllModals();
    });

    // Fullscreen viewer close
    $("fullscreen-viewer").addEventListener("click", () => $("fullscreen-viewer").classList.add("hidden"));

    // Pull to refresh (mobile)
    setupPullToRefresh();
  }

  function closeAllModals() {
    ["editor-modal", "detail-modal", "confirm-modal", "info-modal"].forEach((id) => $(id).classList.add("hidden"));
    $("fullscreen-viewer").classList.add("hidden");
  }

  // ---------------------------------------------------------
  // Routing / views
  // ---------------------------------------------------------
  function routeTo(view) {
    state.view = view;
    qsa(".nav-item, .bn-item").forEach((el) => el.classList.toggle("active", el.dataset.view === view));

    const showCollectionLayout = ["dashboard", "gallery", "favorites"].includes(view);
    $("view-collection").classList.toggle("hidden", !showCollectionLayout);
    $("view-collections").classList.toggle("hidden", view !== "collections");
    $("view-stats").classList.toggle("hidden", view !== "stats");
    $("view-archive").classList.toggle("hidden", view !== "archive");
    $("view-settings").classList.toggle("hidden", view !== "settings");
    $("fab-add").classList.toggle("hidden", !showCollectionLayout);
    $("select-mode-btn").classList.toggle("hidden", !showCollectionLayout);

    const titles = { dashboard: ["Dashboard", "Everything you've saved, newest first."],
      gallery: ["Gallery", "A Pinterest-style view of your vault."],
      favorites: ["Favorites", "The lyrics you loved enough to heart."] };
    if (titles[view]) { $("collection-title").textContent = titles[view][0]; $("collection-sub").textContent = titles[view][1]; }

    if (view === "stats") renderStats();
    if (view === "archive") renderArchiveView();
    if (view === "collections") renderCollectionsView();
    if (showCollectionLayout) renderCurrentView();
  }

  function filteredRows() {
    let rows = state.rows.slice();
    if (state.view === "favorites") rows = rows.filter((r) => r.favorite);
    if (state.activeCollection) rows = rows.filter((r) => (r.collections || []).includes(state.activeCollection));
    if (state.filters.favoritesOnly) rows = rows.filter((r) => r.favorite);
    if (state.filters.language) rows = rows.filter((r) => r.language === state.filters.language);
    if (state.filters.genre) rows = rows.filter((r) => r.genre === state.filters.genre);
    if (state.filters.rating) rows = rows.filter((r) => (r.rating || 0) >= Number(state.filters.rating));

    const q = state.query.toLowerCase();
    if (q) {
      rows = rows.filter((r) => matchesQuery(r, q));
    }

    switch (state.filters.sort) {
      case "alpha": rows.sort((a, b) => (a.title || "").localeCompare(b.title || "")); break;
      case "rating": rows.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
      default: rows.sort((a, b) => (b.pinned - a.pinned) || (new Date(b.date_added) - new Date(a.date_added)));
    }
    return rows;
  }

  // Supports simple advanced syntax: "quoted phrase", AND, OR (space = AND by default)
  function matchesQuery(row, rawQuery) {
    const haystack = [row.title, row.artist, row.extracted_text, row.notes, row.album, row.genre, (row.tags || []).join(" ")]
      .join(" ").toLowerCase();
    if (rawQuery.includes(" or ")) {
      return rawQuery.split(" or ").some((part) => matchesQuery(row, part.trim()));
    }
    const terms = rawQuery.match(/"[^"]+"|\S+/g) || [];
    return terms.every((t) => {
      if (t === "and") return true;
      const clean = t.replace(/^"|"$/g, "");
      return haystack.includes(clean);
    });
  }

  function renderCurrentView() {
    const rows = filteredRows();
    state.detailListSnapshot = rows;
    const target = $("grid-target");
    target.className = "grid " + (state.filters.density || "");

    if (rows.length === 0) {
      UI.emptyState(target, {
        icon: state.view === "favorites" ? "💜" : "🎵",
        title: state.query ? "No matches found" : "Nothing saved yet",
        sub: state.query ? "Try a different search term." : "Add your first lyric to get started.",
        cta: state.query ? "" : `<button class="btn btn-primary" onclick="document.getElementById('fab-add').click()">＋ Add lyric</button>`
      });
      $("bulk-bar").classList.add("hidden");
      return;
    }

    target.innerHTML = rows.map((r) => UI.cardHTML(r, {
      query: state.query, selectMode: state.selectMode, selected: state.selected.has(r.id)
    })).join("");

    updateFavCount();
    updateBulkBar();
  }

  function updateFavCount() {
    $("count-fav").textContent = state.rows.filter((r) => r.favorite).length;
  }

  // ---------------------------------------------------------
  // Grid interactions
  // ---------------------------------------------------------
  function onGridClick(e) {
    const favBtn = e.target.closest("[data-fav]");
    if (favBtn) {
      e.stopPropagation();
      const id = favBtn.dataset.fav;
      const row = state.rows.find((r) => r.id === id);
      quickToggleFavorite(row);
      return;
    }
    const selBox = e.target.closest("[data-select]");
    const card = e.target.closest(".card");
    if (!card) return;
    const id = card.dataset.id;

    if (state.selectMode) {
      toggleSelected(id);
      return;
    }
    if (selBox) { toggleSelected(id); return; }
    openDetail(id);
  }

  async function quickToggleFavorite(row) {
    row.favorite = !row.favorite;
    renderCurrentView();
    try { await DB.toggleFavorite(row.id, row.favorite); }
    catch (err) { row.favorite = !row.favorite; renderCurrentView(); UI.toast("Couldn't update favorite.", "error"); }
  }

  function toggleSelectMode() {
    state.selectMode = !state.selectMode;
    state.selected.clear();
    renderCurrentView();
  }
  function toggleSelected(id) {
    if (state.selected.has(id)) state.selected.delete(id); else state.selected.add(id);
    renderCurrentView();
  }
  function updateBulkBar() {
    const bar = $("bulk-bar");
    if (state.selectMode && state.selected.size > 0) {
      bar.classList.remove("hidden");
      $("bulk-count").textContent = `${state.selected.size} selected`;
    } else {
      bar.classList.add("hidden");
    }
  }
  async function bulkDelete() {
    confirmAction(`Move ${state.selected.size} lyric(s) to Archive?`, async () => {
      try {
        await DB.bulkDeleteSoft(Array.from(state.selected));
        UI.toast("Moved to archive.", "success");
        state.selectMode = false; state.selected.clear();
        await loadAll();
      } catch (err) { UI.toast("Bulk delete failed: " + err.message, "error"); }
    });
  }
  function bulkTagPrompt() {
    showInfoModal("Add tag to selected", `
      <div class="field"><input type="text" id="bulk-tag-input" placeholder="e.g. road-trip" /></div>
      <div class="detail-actions"><button class="btn btn-primary" id="bulk-tag-confirm">Apply</button></div>
    `);
    $("bulk-tag-confirm").addEventListener("click", async () => {
      const tag = $("bulk-tag-input").value.trim();
      if (!tag) return;
      try {
        await DB.bulkAddTag(Array.from(state.selected), tag);
        UI.toast("Tag applied.", "success");
        $("info-modal").classList.add("hidden");
        state.selectMode = false; state.selected.clear();
        await loadAll();
      } catch (err) { UI.toast("Failed: " + err.message, "error"); }
    });
  }

  function randomLyric() {
    if (state.rows.length === 0) { UI.toast("Your vault is empty.", "info"); return; }
    const r = state.rows[Math.floor(Math.random() * state.rows.length)];
    openDetail(r.id);
  }

  // ---------------------------------------------------------
  // Confirm dialog helper
  // ---------------------------------------------------------
  function confirmAction(message, onYes) {
    $("confirm-message").textContent = message;
    $("confirm-modal").classList.remove("hidden");
    const yesBtn = $("confirm-yes");
    const clean = yesBtn.cloneNode(true);
    yesBtn.parentNode.replaceChild(clean, yesBtn);
    clean.addEventListener("click", () => { $("confirm-modal").classList.add("hidden"); onYes(); });
  }
  function showInfoModal(title, bodyHtml) {
    $("info-title").textContent = title;
    $("info-body").innerHTML = bodyHtml;
    $("info-modal").classList.remove("hidden");
  }

  // ---------------------------------------------------------
  // Editor modal (Add / Edit)
  // ---------------------------------------------------------
  function wireEditorModal() {
    $("editor-close").addEventListener("click", closeEditor);
    $("editor-cancel").addEventListener("click", closeEditor);
    $("f-favorite-toggle").addEventListener("click", () => {
      const on = $("f-favorite-toggle").dataset.on === "1";
      $("f-favorite-toggle").dataset.on = on ? "0" : "1";
      $("f-favorite-toggle").textContent = on ? "🤍 Not favorite" : "💜 Favorite";
      $("f-favorite-toggle").classList.toggle("active", !on);
    });
    $("f-pin-toggle").addEventListener("click", () => {
      const on = $("f-pin-toggle").dataset.on === "1";
      $("f-pin-toggle").dataset.on = on ? "0" : "1";
      $("f-pin-toggle").textContent = on ? "📌 Not pinned" : "📌 Pinned";
      $("f-pin-toggle").classList.toggle("active", !on);
    });

    // Rich text notes toolbar
    qsa(".rte-toolbar button").forEach((btn) => {
      btn.addEventListener("click", () => {
        $("f-notes").focus();
        if (btn.dataset.cmd === "createLink") {
          const url = prompt("Link URL:");
          if (url) document.execCommand("createLink", false, url);
        } else {
          document.execCommand(btn.dataset.cmd, false, null);
        }
      });
    });

    // Dropzone
    const dz = $("dropzone");
    dz.addEventListener("click", () => $("image-input").click());
    dz.addEventListener("dragover", (e) => { e.preventDefault(); dz.classList.add("drag-over"); });
    dz.addEventListener("dragleave", () => dz.classList.remove("drag-over"));
    dz.addEventListener("drop", (e) => {
      e.preventDefault(); dz.classList.remove("drag-over");
      if (e.dataTransfer.files[0]) handleImageFile(e.dataTransfer.files[0]);
    });
    $("image-input").addEventListener("change", (e) => { if (e.target.files[0]) handleImageFile(e.target.files[0]); });
    $("camera-input").addEventListener("change", (e) => { if (e.target.files[0]) handleImageFile(e.target.files[0]); });

    $("rerun-ocr-btn").addEventListener("click", async () => {
      if (!state.pendingImage) { UI.toast("Upload an image first.", "info"); return; }
      await runOcrOn(state.pendingImage.compressedFile || state.pendingImage.file);
    });

    $("editor-form").addEventListener("submit", onEditorSave);
  }

  function openEditor(existing = null) {
    state.editingId = existing ? existing.id : null;
    state.pendingImage = existing && existing.image_url ? { url: existing.image_url, path: existing.image_path } : null;

    $("editor-title").textContent = existing ? "Edit lyric" : "Add lyric";
    $("f-title").value = existing?.title || "";
    $("f-artist").value = existing?.artist || "";
    $("f-album").value = existing?.album || "";
    $("f-language").value = existing?.language || "";
    $("f-genre").value = existing?.genre || "";
    $("f-mood").value = existing?.mood || "";
    $("f-rating").value = existing?.rating || 0;
    $("f-tags").value = (existing?.tags || []).join(", ");
    $("f-collections").value = (existing?.collections || []).join(", ");
    $("f-extracted").value = existing?.extracted_text || "";
    $("f-notes").innerHTML = existing?.notes || "";

    const isFav = !!existing?.favorite;
    $("f-favorite-toggle").dataset.on = isFav ? "1" : "0";
    $("f-favorite-toggle").textContent = isFav ? "💜 Favorite" : "🤍 Not favorite";
    const isPin = !!existing?.pinned;
    $("f-pin-toggle").dataset.on = isPin ? "1" : "0";
    $("f-pin-toggle").textContent = isPin ? "📌 Pinned" : "📌 Not pinned";

    $("dup-warning").classList.add("hidden");
    $("ocr-progress").classList.add("hidden");
    $("ocr-progress-label").classList.add("hidden");
    if (existing?.image_url) {
      $("image-preview").src = existing.image_url;
      $("image-preview").classList.remove("hidden");
      $("dropzone-hint").classList.add("hidden");
    } else {
      $("image-preview").classList.add("hidden");
      $("dropzone-hint").classList.remove("hidden");
    }

    $("editor-modal").classList.remove("hidden");
  }
  function closeEditor() { $("editor-modal").classList.add("hidden"); }

  async function handleImageFile(file) {
    const cfg = window.LYRICS_VAULT_CONFIG;
    if (!cfg.ALLOWED_TYPES.includes(file.type)) {
      UI.toast("Unsupported file type. Use JPG, PNG, WEBP or HEIC.", "error"); return;
    }
    if (file.size > cfg.MAX_IMAGE_BYTES) {
      UI.toast("Image is larger than 10 MB.", "error"); return;
    }
    const previewUrl = URL.createObjectURL(file);
    $("image-preview").src = previewUrl;
    $("image-preview").classList.remove("hidden");
    $("dropzone-hint").classList.add("hidden");

    const compressed = await compressImage(file);
    state.pendingImage = { file, compressedFile: compressed, url: previewUrl, path: null };
    await runOcrOn(compressed);
  }

  function compressImage(file, maxDim = 1800, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = (e) => { img.src = e.target.result; };
      reader.readAsDataURL(file);
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const scale = maxDim / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement("canvas");
        canvas.width = width; canvas.height = height;
        canvas.getContext("2d").drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          resolve(blob ? new File([blob], file.name, { type: "image/jpeg" }) : file);
        }, "image/jpeg", quality);
      };
      img.onerror = () => resolve(file);
    });
  }

  async function runOcrOn(fileOrUrl) {
    $("ocr-progress").classList.remove("hidden");
    $("ocr-progress-label").classList.remove("hidden");
    try {
      const { text, confidence } = await OCR.run(fileOrUrl, (status, pct) => {
        $("ocr-progress-fill").style.width = pct + "%";
        $("ocr-progress-label").textContent = `${status}... ${pct}%`;
      });
      $("f-extracted").value = text;
      $("ocr-progress-label").textContent = `Done — confidence ${confidence}%`;
      checkForDuplicates(text);
      autoSuggestTitle(text);
    } catch (err) {
      UI.toast("OCR failed: " + err.message, "error");
      $("ocr-progress-label").textContent = "OCR failed — you can type lyrics manually.";
    }
  }

  function checkForDuplicates(text) {
    const dupes = DB.findLikelyDuplicates(text, state.rows.filter((r) => r.id !== state.editingId));
    const box = $("dup-warning");
    if (dupes.length > 0) {
      box.classList.remove("hidden");
      box.textContent = `⚠ This looks similar to "${dupes[0].row.title}" (${Math.round(dupes[0].score * 100)}% match). Saving will create a separate entry.`;
    } else {
      box.classList.add("hidden");
    }
  }

  function autoSuggestTitle(text) {
    if ($("f-title").value.trim()) return; // don't override
    const firstLine = (text || "").split("\n").map((l) => l.trim()).find((l) => l.length > 2);
    if (firstLine) $("f-title").value = firstLine.slice(0, 80);
  }

  async function onEditorSave(e) {
    e.preventDefault();
    const saveBtn = $("editor-save");
    saveBtn.disabled = true; saveBtn.textContent = "Saving...";
    try {
      let image_url = state.pendingImage?.url && !state.pendingImage.file ? state.pendingImage.url : null;
      let image_path = state.pendingImage?.path || null;

      if (state.pendingImage?.file) {
        const uploaded = await DB.uploadImage(state.pendingImage.compressedFile || state.pendingImage.file);
        image_url = uploaded.url;
        image_path = uploaded.path;
      } else if (state.pendingImage?.url) {
        image_url = state.pendingImage.url;
      }

      const record = {
        title: $("f-title").value.trim() || "Untitled",
        artist: $("f-artist").value.trim(),
        album: $("f-album").value.trim(),
        language: $("f-language").value.trim(),
        genre: $("f-genre").value.trim(),
        mood: $("f-mood").value.trim(),
        tags: splitCsv($("f-tags").value),
        collections: splitCsv($("f-collections").value),
        notes: $("f-notes").innerHTML.trim(),
        extracted_text: $("f-extracted").value,
        favorite: $("f-favorite-toggle").dataset.on === "1",
        pinned: $("f-pin-toggle").dataset.on === "1",
        rating: Number($("f-rating").value) || 0,
        image_url, image_path
      };

      if (state.editingId) {
        await DB.update(state.editingId, record);
        UI.toast("Lyric updated.", "success");
      } else {
        await DB.create(record);
        UI.toast("Lyric saved to your vault.", "success");
      }
      closeEditor();
      await loadAll();
    } catch (err) {
      UI.toast("Save failed: " + err.message, "error");
    } finally {
      saveBtn.disabled = false; saveBtn.textContent = "💾 Save";
    }
  }
  function splitCsv(str) { return str.split(",").map((s) => s.trim()).filter(Boolean); }

  // ---------------------------------------------------------
  // Detail modal
  // ---------------------------------------------------------
  function wireDetailModal() {
    $("detail-close").addEventListener("click", () => $("detail-modal").classList.add("hidden"));
    $("d-image").addEventListener("click", () => {
      $("fullscreen-img-el").src = $("d-image").src;
      $("fullscreen-viewer").classList.remove("hidden");
    });

    // swipe navigation
    let touchStartX = 0;
    const wrap = qs(".detail-img-wrap");
    wrap.addEventListener("touchstart", (e) => { touchStartX = e.touches[0].clientX; }, { passive: true });
    wrap.addEventListener("touchend", (e) => {
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 60) navigateDetail(dx > 0 ? -1 : 1);
    }, { passive: true });
  }

  function openDetail(id) {
    const row = state.rows.find((r) => r.id === id) || state.archived.find((r) => r.id === id);
    if (!row) return;
    state.detailIndex = state.detailListSnapshot.findIndex((r) => r.id === id);
    renderDetail(row);
    $("detail-modal").classList.remove("hidden");
    pushRecentlyViewed(id);
  }

  function navigateDetail(dir) {
    if (state.detailListSnapshot.length === 0) return;
    let idx = state.detailIndex + dir;
    if (idx < 0) idx = state.detailListSnapshot.length - 1;
    if (idx >= state.detailListSnapshot.length) idx = 0;
    state.detailIndex = idx;
    renderDetail(state.detailListSnapshot[idx]);
  }

  function renderDetail(row) {
    $("d-image").src = row.image_url || "";
    $("d-title").textContent = row.title;
    $("d-artist").textContent = row.artist || "Unknown artist";
    $("d-meta").innerHTML = [row.language, row.album, row.genre, row.mood, ...(row.tags || [])]
      .filter(Boolean).map((t) => `<span class="tag">${UI.escapeHtml(t)}</span>`).join("");
    $("d-text").textContent = row.extracted_text || "(no extracted text yet)";
    $("d-notes").innerHTML = row.notes || "";
    $("d-rating").innerHTML = "★★★★★".split("").map((s, i) => `<span class="${i < (row.rating || 0) ? "on" : ""}">★</span>`).join("");
    $("d-favorite").textContent = row.favorite ? "💜 Favorited" : "🤍 Favorite";

    $("d-favorite").onclick = () => quickToggleFavorite(row).then(() => renderDetail(row));
    $("d-edit").onclick = () => { $("detail-modal").classList.add("hidden"); openEditor(row); };
    $("d-delete").onclick = () => confirmAction(`Move "${row.title}" to Archive?`, async () => {
      await DB.softDelete(row.id);
      $("detail-modal").classList.add("hidden");
      UI.toast("Moved to archive.", "success");
      await loadAll();
    });
    $("d-download").onclick = () => {
      if (!row.image_url) { UI.toast("No image to download.", "info"); return; }
      const a = document.createElement("a");
      a.href = row.image_url; a.download = `${row.title || "lyric"}.jpg`; a.target = "_blank"; a.click();
    };
    $("d-copy").onclick = async () => {
      try { await navigator.clipboard.writeText(row.extracted_text || ""); UI.toast("Lyrics copied.", "success"); }
      catch { UI.toast("Could not copy.", "error"); }
    };
    $("d-share").onclick = async () => {
      const url = `${window.location.origin}${window.location.pathname}?lyric=${row.id}`;
      try { await navigator.clipboard.writeText(url); UI.toast("Private link copied (only your account can open it).", "success"); }
      catch { showInfoModal("Share link", `<p style="font-size:13px;">${UI.escapeHtml(url)}</p>`); }
    };
    $("d-qr").onclick = () => {
      const url = `${window.location.origin}${window.location.pathname}?lyric=${row.id}`;
      const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}`;
      showInfoModal("QR code", `<div style="text-align:center;"><img src="${qrSrc}" alt="QR code" style="border-radius:12px;" /><p style="font-size:11.5px; color:var(--text-dim); margin-top:10px;">Scans to your private lyric link.</p></div>`);
    };
  }

  function pushRecentlyViewed(id) {
    try {
      let list = JSON.parse(localStorage.getItem("lv_recent") || "[]");
      list = [id, ...list.filter((x) => x !== id)].slice(0, 12);
      localStorage.setItem("lv_recent", JSON.stringify(list));
    } catch (e) {}
  }

  // ---------------------------------------------------------
  // Collections view
  // ---------------------------------------------------------
  function renderCollectionsView() {
    const collectionSet = new Set();
    state.rows.forEach((r) => (r.collections || []).forEach((c) => collectionSet.add(c)));
    const list = $("collections-list");
    if (collectionSet.size === 0) {
      list.innerHTML = "";
      UI.emptyState($("collections-grid"), {
        icon: "📁", title: "No collections yet",
        sub: "Add a collection name (like Tamil, Night Drive, Study) when saving a lyric.",
        cta: ""
      });
      return;
    }
    list.innerHTML = `<div class="chip ${!state.activeCollection ? "active" : ""}" data-collection="">All</div>` +
      Array.from(collectionSet).sort().map((c) =>
        `<div class="chip ${state.activeCollection === c ? "active" : ""}" data-collection="${UI.escapeHtml(c)}">📁 ${UI.escapeHtml(c)}</div>`
      ).join("");
    qsa("[data-collection]", list).forEach((chip) => {
      chip.addEventListener("click", () => {
        state.activeCollection = chip.dataset.collection || null;
        renderCollectionsView();
      });
    });
    const rows = state.activeCollection ? state.rows.filter((r) => (r.collections || []).includes(state.activeCollection)) : state.rows;
    state.detailListSnapshot = rows;
    const grid = $("collections-grid");
    if (rows.length === 0) {
      UI.emptyState(grid, { icon: "📁", title: "Empty collection", sub: "No lyrics tagged with this collection yet." });
    } else {
      grid.className = "grid";
      grid.innerHTML = rows.map((r) => UI.cardHTML(r, { query: "" })).join("");
    }
  }

  // ---------------------------------------------------------
  // Stats view
  // ---------------------------------------------------------
  function renderStats() {
    const s = DB.computeStats(state.rows);
    const cards = [
      ["📚", s.total, "Total lyrics"],
      ["💜", s.favorites, "Favorites"],
      ["🌐", s.languages, "Languages"],
      ["🎤", s.artists, "Artists"],
      ["🎼", s.genres, "Genres"]
    ];
    $("stat-cards").innerHTML = cards.map(([icon, val, lbl]) =>
      `<div class="stat-card glass"><div class="val">${icon} ${val}</div><div class="lbl">${lbl}</div></div>`).join("");

    const months = Object.keys(s.monthly).sort().slice(-8);
    const max = Math.max(1, ...months.map((m) => s.monthly[m]));
    $("monthly-chart").innerHTML = months.map((m) => {
      const h = Math.round((s.monthly[m] / max) * 90) + 10;
      return `<div class="bar" style="height:${h}px"><span>${m.slice(5)}</span></div>`;
    }).join("") || `<p style="color:var(--text-dim); font-size:13px;">No uploads yet.</p>`;

    $("top-tags").innerHTML = s.topTags.length
      ? s.topTags.map(([tag, count]) => `<span class="tag">${UI.escapeHtml(tag)} · ${count}</span>`).join("")
      : `<p style="color:var(--text-dim); font-size:13px;">No tags yet.</p>`;
  }

  // ---------------------------------------------------------
  // Archive view
  // ---------------------------------------------------------
  async function renderArchiveView() {
    await refreshArchive();
    const grid = $("archive-grid");
    if (state.archived.length === 0) {
      UI.emptyState(grid, { icon: "🗑️", title: "Archive is empty", sub: "Deleted lyrics will show up here for 30 days." });
      return;
    }
    grid.className = "grid";
    grid.innerHTML = state.archived.map((r) => `
      <div class="card glass" data-archived-id="${r.id}">
        ${r.image_url ? `<img class="thumb" src="${r.image_url}" loading="lazy">` : `<div class="thumb-fallback">🎵</div>`}
        <div class="body">
          <p class="title">${UI.escapeHtml(r.title)}</p>
          <p class="artist">${UI.escapeHtml(r.artist || "")}</p>
          <div class="detail-actions">
            <button class="btn btn-ghost" data-restore="${r.id}" style="font-size:11.5px; padding:6px 12px;">↺ Restore</button>
            <button class="btn btn-danger" data-purge="${r.id}" style="font-size:11.5px; padding:6px 12px;">✕ Delete forever</button>
          </div>
        </div>
      </div>`).join("");

    qsa("[data-restore]", grid).forEach((btn) => btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      await DB.restore(btn.dataset.restore);
      UI.toast("Restored.", "success");
      await loadAll(); await renderArchiveView();
    }));
    qsa("[data-purge]", grid).forEach((btn) => btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const row = state.archived.find((r) => r.id === btn.dataset.purge);
      confirmAction("Permanently delete this lyric? This cannot be undone.", async () => {
        await DB.hardDelete(row.id, row.image_path);
        UI.toast("Deleted permanently.", "success");
        await renderArchiveView();
      });
    }));
  }

  // ---------------------------------------------------------
  // Theme
  // ---------------------------------------------------------
  function applyStoredTheme() {
    const stored = localStorage.getItem("lv_theme") || "dark";
    setTheme(stored, false);
  }
  function setTheme(choice, persist = true) {
    let actual = choice;
    if (choice === "auto") {
      actual = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    document.body.setAttribute("data-theme", actual);
    qsa(".theme-switch button").forEach((b) => b.classList.toggle("active", b.dataset.themeChoice === choice));
    if (persist) localStorage.setItem("lv_theme", choice);
  }

  // ---------------------------------------------------------
  // Pull to refresh (mobile)
  // ---------------------------------------------------------
  function setupPullToRefresh() {
    const indicator = document.createElement("div");
    indicator.className = "pull-indicator";
    indicator.textContent = "↓ Pull to refresh";
    $("app-view").insertBefore(indicator, $("app-view").firstChild.nextSibling);

    let startY = 0, pulling = false;
    document.addEventListener("touchstart", (e) => {
      if (window.scrollY === 0) { startY = e.touches[0].clientY; pulling = true; }
    }, { passive: true });
    document.addEventListener("touchmove", (e) => {
      if (!pulling) return;
      const dy = e.touches[0].clientY - startY;
      if (dy > 10 && dy < 140) indicator.style.height = Math.min(dy, 50) + "px";
    }, { passive: true });
    document.addEventListener("touchend", async (e) => {
      if (!pulling) return;
      pulling = false;
      if (parseInt(indicator.style.height || "0") >= 40) {
        indicator.textContent = "Refreshing...";
        await loadAll();
        UI.toast("Refreshed.", "success", 1500);
      }
      indicator.style.height = "0px";
      indicator.textContent = "↓ Pull to refresh";
    });
  }

  // ---------------------------------------------------------
  // PWA
  // ---------------------------------------------------------
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker.register("sw.js").catch(() => {});
      });
    }
  }
})();

// ============================================================
// Lyrics Vault — UI helpers
// ============================================================
const UI = (() => {
  function escapeHtml(str) {
    return (str || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function highlight(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const q = escapeHtml(query).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return escaped.replace(new RegExp(`(${q})`, "ig"), "<mark>$1</mark>");
  }

  function toast(message, type = "info", ms = 3200) {
    const stack = document.getElementById("toast-stack");
    const el = document.createElement("div");
    el.className = `toast glass ${type}`;
    const icon = type === "success" ? "✅" : type === "error" ? "⚠️" : "ℹ️";
    el.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;
    stack.appendChild(el);
    setTimeout(() => {
      el.style.opacity = "0";
      el.style.transform = "translateX(30px)";
      el.style.transition = "all .25s ease";
      setTimeout(() => el.remove(), 250);
    }, ms);
  }

  function skeletonGrid(target, count = 8) {
    target.innerHTML = "";
    for (let i = 0; i < count; i++) {
      const d = document.createElement("div");
      d.className = "skeleton thumb";
      target.appendChild(d);
    }
  }

  function emptyState(target, { icon = "🎵", title = "Nothing here yet", sub = "", cta = "" }) {
    target.innerHTML = `
      <div class="empty-state">
        <div class="e-icon">${icon}</div>
        <h3>${escapeHtml(title)}</h3>
        <p>${escapeHtml(sub)}</p>
        ${cta}
      </div>`;
  }

  function cardHTML(row, { query = "", selectMode = false, selected = false } = {}) {
    const img = row.image_url
      ? `<img class="thumb" src="${row.image_url}" loading="lazy" alt="">`
      : `<div class="thumb-fallback">🎵</div>`;
    const fav = row.favorite ? "fav-btn is-fav" : "fav-btn";
    const favIcon = row.favorite ? "💜" : "🤍";
    const pin = row.pinned ? `<div class="pin-badge">📌</div>` : "";
    const selBox = selectMode
      ? `<div class="select-box ${selected ? "checked" : ""}" data-select="${row.id}">${selected ? "✓" : ""}</div>`
      : "";
    return `
      <div class="card glass" data-id="${row.id}">
        ${selBox}
        ${!selectMode ? pin : ""}
        ${!selectMode ? `<button class="${fav}" data-fav="${row.id}">${favIcon}</button>` : ""}
        ${img}
        <div class="body">
          <p class="title">${highlight(row.title || "Untitled", query)}</p>
          <p class="artist">${highlight(row.artist || "Unknown artist", query)}</p>
          <div class="meta-row">
            <span>${row.language || "—"}</span>
            <span>·</span>
            <span>${new Date(row.date_added).toLocaleDateString()}</span>
          </div>
        </div>
      </div>`;
  }

  return { escapeHtml, highlight, toast, skeletonGrid, emptyState, cardHTML };
})();

(() => {
  const btn = document.getElementById("reset-progress");
  const dataEl = document.getElementById("reset-data");
  if (!btn || !dataEl) return;

  let data = null;
  try {
    data = JSON.parse(dataEl.textContent || "{}");
  } catch (err) {
    data = null;
  }
  if (!data || !Array.isArray(data.items) || !data.items.length) return;

  const TOTALS = {
    "k1-l1-a2": 29,
    "k1-l2-a1": 29,
    "k1-l2-a2": 29,
    "k1-l2-a3": 29,
    "k1-l3-a1-ue2": 28,
    "k1-l3-a1-ue3": 42,
    "k1-l3-a1-ue4": 30,
    "k1-l3-a2-ue2": 28,
    "k1-l3-a2-ue3": 42,
    "k1-l3-a2-ue4": 56,
    "k1-l3-a3-ue2": 29,
    "k1-l3-a3-ue3": 20,
    "k1-l3-a3-ue4": 15,
    "k1-l4-a1-ue2": 0,
    "k1-l4-a2-ue2": 0,
    "k1-l4-a3-ue2": 0,
    "k1-l4-a4": 0,
    "k1-l5-a2": 0,
    "k1-l5-a3": 0,
    "k1-l6-a2": 0,
    "k1-l6-a3": 0,
    "k1-l7-a1-ue2": 0,
    "k1-l7-a2-ue2": 0,
    "k1-l7-a3-ue2": 0,
    "k1-l8-a2": 0,
    "k1-l9-a2": 0,
    "k1-l10-a2": 0,
    "k1-l11-a2": 0,
    "k1-l12-a1": 0
  };

  function getLimitForExercise(id) {
    const base = TOTALS[id] || 0;
    const raw = localStorage.getItem(`elifba.limit.${id}`);
    if (!raw || raw === "all") return base;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return base;
    return Math.min(parsed, base);
  }

  function readProgress(id, mode) {
    const totalBase = getLimitForExercise(id);
    let raw = localStorage.getItem(`elifba.progress.${id}.${mode}`);
    if (!raw && mode === "sequence") {
      raw = localStorage.getItem(`elifba.progress.${id}`);
    }
    if (!raw) return { learned: 0, total: totalBase };
    try {
      const parsed = JSON.parse(raw);
      const learned = Number(parsed.learned) || 0;
      const total = Number(parsed.total) || totalBase;
      return { learned, total };
    } catch (err) {
      return { learned: 0, total: totalBase };
    }
  }

  function getPercent(id) {
    const seq = readProgress(id, "sequence");
    const shuf = readProgress(id, "shuffle");
    const learned = Math.max(seq.learned, shuf.learned);
    const total = Math.max(seq.total, shuf.total);
    return total ? Math.round((learned / total) * 100) : 0;
  }

  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal">
      <p class="modal-eyebrow">Fortschritt zurücksetzen</p>
      <h2 class="modal-title">Übung auswählen</h2>
      <p class="modal-text">Wähle die Übung, deren globaler Fortschritt gelöscht werden soll.</p>
      <div class="modal-list reset-list"></div>
      <div class="modal-actions-row">
        <button class="modal-btn ghost" type="button" data-action="stay">Abbrechen</button>
        <button class="modal-btn primary" type="button" data-action="confirm" disabled>Zurücksetzen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  const listEl = overlay.querySelector(".reset-list");
  const confirmBtn = overlay.querySelector('[data-action="confirm"]');
  const selectedIds = new Set();

  function renderList() {
    listEl.innerHTML = data.items.map((item) => {
      const percent = getPercent(item.id);
      return `
        <button class="list-row reset-row" type="button" data-id="${item.id}">
          <span class="list-label">${item.label}</span>
          <span class="list-value">${percent}%</span>
        </button>
      `;
    }).join("");

    listEl.querySelectorAll(".reset-row").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-id");
        if (selectedIds.has(id)) {
          selectedIds.delete(id);
          row.classList.remove("active");
        } else {
          selectedIds.add(id);
          row.classList.add("active");
        }
        confirmBtn.disabled = selectedIds.size === 0;
      });
    });
  }

  function clearProgress(id) {
    localStorage.removeItem(`elifba.progress.${id}.sequence`);
    localStorage.removeItem(`elifba.progress.${id}.shuffle`);
    localStorage.removeItem(`elifba.progress.${id}`);
    localStorage.removeItem(`elifba.batch.${id}.sequence`);
    localStorage.removeItem(`elifba.batch.${id}.shuffle`);
    localStorage.removeItem(`elifba.sessionReset.${id}.sequence`);
    localStorage.removeItem(`elifba.sessionReset.${id}.shuffle`);
  }

  overlay.querySelector('[data-action="stay"]').addEventListener("click", () => {
    overlay.classList.remove("visible");
  });

  confirmBtn.addEventListener("click", () => {
    if (!selectedIds.size) return;
    const confirmOverlay = document.createElement("div");
    confirmOverlay.className = "modal-overlay visible";
    const count = selectedIds.size;
    confirmOverlay.innerHTML = `
      <div class="modal">
        <p class="modal-eyebrow">Sicher?</p>
        <h2 class="modal-title">Fortschritt wirklich zurücksetzen?</h2>
        <p class="modal-text">Du bist dabei, den Fortschritt von ${count} Übung${count === 1 ? "" : "en"} zu löschen. Dieser Schritt kann nicht rückgängig gemacht werden.</p>
        <div class="modal-actions-row">
          <button class="modal-btn ghost" type="button" data-action="stay">Abbrechen</button>
          <button class="modal-btn primary" type="button" data-action="confirm">Ja, zurücksetzen</button>
        </div>
      </div>
    `;
    document.body.appendChild(confirmOverlay);
    confirmOverlay.querySelector('[data-action="stay"]').addEventListener("click", () => {
      confirmOverlay.remove();
    });
    confirmOverlay.querySelector('[data-action="confirm"]').addEventListener("click", () => {
      selectedIds.forEach((id) => clearProgress(id));
      confirmOverlay.remove();
      overlay.classList.remove("visible");
      window.dispatchEvent(new Event("progress:update"));
      window.location.reload();
    });
  });

  renderList();

  btn.addEventListener("click", () => {
    overlay.classList.add("visible");
  });
})();

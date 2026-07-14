(function () {
  const metaEl = document.getElementById("progress-meta");
  const container = document.getElementById("progress-overview");
  if (!metaEl || !container) return;

  let meta = {};
  try {
    meta = JSON.parse(metaEl.textContent || "{}");
  } catch (err) {
    meta = {};
  }

  const STORAGE_PREFIX = "elifba.progress.";
  const EXERCISES = [
    { id: "k1-l1-a2", chapter: "elifba", lesson: "1", section: "l1-a2" },
    { id: "k1-l2-a1", chapter: "elifba", lesson: "2", section: "l2-a1" },
    { id: "k1-l2-a2", chapter: "elifba", lesson: "2", section: "l2-a2" },
    { id: "k1-l2-a3", chapter: "elifba", lesson: "2", section: "l2-a3" },
    { id: "k1-l3-a1-ue2", chapter: "elifba", lesson: "3", section: "l3-a1" },
    { id: "k1-l3-a1-ue3", chapter: "elifba", lesson: "3", section: "l3-a1" },
    { id: "k1-l3-a1-ue4", chapter: "elifba", lesson: "3", section: "l3-a1" },
    { id: "k1-l3-a2-ue2", chapter: "elifba", lesson: "3", section: "l3-a2" },
    { id: "k1-l3-a2-ue3", chapter: "elifba", lesson: "3", section: "l3-a2" },
    { id: "k1-l3-a2-ue4", chapter: "elifba", lesson: "3", section: "l3-a2" },
    { id: "k1-l3-a3-ue2", chapter: "elifba", lesson: "3", section: "l3-a3" },
    { id: "k1-l3-a3-ue3", chapter: "elifba", lesson: "3", section: "l3-a3" },
    { id: "k1-l3-a3-ue4", chapter: "elifba", lesson: "3", section: "l3-a3" },
    { id: "k1-l4-a1-ue2", chapter: "elifba", lesson: "4", section: "l4-a1" },
    { id: "k1-l4-a2-ue2", chapter: "elifba", lesson: "4", section: "l4-a2" },
    { id: "k1-l4-a3-ue2", chapter: "elifba", lesson: "4", section: "l4-a3" },
    { id: "k1-l4-a4", chapter: "elifba", lesson: "4", section: "l4-a4" },
    { id: "k1-l5-a2", chapter: "elifba", lesson: "5", section: "l5-a2" },
    { id: "k1-l5-a3", chapter: "elifba", lesson: "5", section: "l5-a3" },
    { id: "k1-l6-a2", chapter: "elifba", lesson: "6", section: "l6-a2" },
    { id: "k1-l6-a3", chapter: "elifba", lesson: "6", section: "l6-a3" },
    { id: "k1-l7-a1-ue2", chapter: "elifba", lesson: "7", section: "l7-a1" },
    { id: "k1-l7-a2-ue2", chapter: "elifba", lesson: "7", section: "l7-a2" },
    { id: "k1-l7-a3-ue2", chapter: "elifba", lesson: "7", section: "l7-a3" },
    { id: "k1-l8-a2", chapter: "elifba", lesson: "8", section: "l8-a2" },
    { id: "k1-l9-a2", chapter: "elifba", lesson: "9", section: "l9-a2" },
    { id: "k1-l10-a2", chapter: "elifba", lesson: "10", section: "l10-a2" },
    { id: "k1-l11-a2", chapter: "elifba", lesson: "11", section: "l11-a2" },
    { id: "k1-l12-a1", chapter: "elifba", lesson: "12", section: "l12-a1" }
  ];
  const MODES = ["sequence", "shuffle"];
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
    const totalBase = TOTALS[id] || 0;
    const raw = localStorage.getItem(`elifba.limit.${id}`);
    if (!raw || raw === "all") return totalBase;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return totalBase;
    return Math.min(parsed, totalBase);
  }

  function readProgress(id, mode) {
    const totalBase = getLimitForExercise(id);
    let raw = localStorage.getItem(`${STORAGE_PREFIX}${id}.${mode}`);
    if (!raw && mode === "sequence") {
      raw = localStorage.getItem(STORAGE_PREFIX + id);
    }
    if (!raw) return { learned: 0, total: totalBase, completedCount: 0 };
    try {
      const parsed = JSON.parse(raw);
      const learned = Number(parsed.learned) || 0;
      const total = Number(parsed.total) || totalBase;
      const completedCount = Number(parsed.completedCount) || 0;
      return { learned, total, completedCount };
    } catch (err) {
      return { learned: 0, total: totalBase, completedCount: 0 };
    }
  }

  function getExerciseStats(id) {
    const seq = readProgress(id, "sequence");
    const shuf = readProgress(id, "shuffle");
    const learned = Math.max(seq.learned, shuf.learned);
    const total = Math.max(seq.total, shuf.total);
    const completedCount = Math.max(seq.completedCount, shuf.completedCount);
    const percent = total ? Math.round((learned / total) * 100) : 0;
    return { learned, total, completedCount, percent };
  }

  function getModePercent(id, mode) {
    const data = readProgress(id, mode);
    return data.total ? Math.round((data.learned / data.total) * 100) : 0;
  }

  function aggregate(filterFn) {
    let learnedSum = 0;
    let totalSum = 0;
    let completedSum = 0;
    EXERCISES.filter(filterFn).forEach((entry) => {
      const data = getExerciseStats(entry.id);
      learnedSum += data.learned;
      totalSum += data.total;
      completedSum += data.completedCount;
    });
    const percent = totalSum ? Math.round((learnedSum / totalSum) * 100) : 0;
    return { percent, learned: learnedSum, total: totalSum, completedCount: completedSum };
  }

  const NAMES = {
    chapters: { elifba: "Elifba" },
    lessons: {
      "1": "1. Buchstaben des Korans",
      "2": "2. Anfangs, Mittel- und Endstellung",
      "3": "3. Vokalzeichen",
      "4": "4. Die Dehnungsbuchstaben",
      "5": "5. Das Dschezm-Zeichen",
      "6": "6. Das Schedde - Das Verdopplungszeichen",
      "7": "7. Das Tenwin",
      "8": "8. Das runde Te",
      "9": "9. Das Dehnungszeichen",
      "10": "10. Das Verlängerungszeichen",
      "11": "11. Das Hemze",
      "12": "12. Abschluss Elifba"
    },
    sections: {
      "l1-a2": "1.2 Lerne die Buchstaben des Korans",
      "l2-a1": "2.1 Anfangsstellung",
      "l2-a2": "2.2 Mittelstellung",
      "l2-a3": "2.3 Endstellung",
      "l3-a1": "3.1 Fetha",
      "l3-a2": "3.2 Kesra",
      "l3-a3": "3.3 Damme",
      "l4-a1": "4.1 Das Dehnungs-Elif",
      "l4-a2": "4.2 Das Dehnungs-Ye",
      "l4-a3": "4.3 Das Dehnungs-Vav",
      "l4-a4": "4.4 Übungen mit allen Dehnungsbuchstaben",
      "l5-a2": "5.2 Das Dschezm mit einzelnen Buchstaben",
      "l5-a3": "5.3 Das Dschezm in Buchstabengruppen",
      "l6-a2": "6.2 Das Schedde mit einzelnen Buchstaben",
      "l6-a3": "6.3 Das Schedde in Buchstabengruppen",
      "l7-a1": "7.1 Doppel-Fetha",
      "l7-a2": "7.2 Doppel-Kesra",
      "l7-a3": "7.3 Doppel-Damme",
      "l8-a2": "8.2 Übungen mit rundem Te",
      "l9-a2": "9.2 Übungen mit dem Dehnungszeichen",
      "l10-a2": "10.2 Übungen mit dem Verlängerungszeichen",
      "l11-a2": "11.2 Übungen mit Hemze",
      "l12-a1": "12.1 Abschlussübungen"
    },
    exercises: {
      "k1-l1-a2": "1.2 Lerne die Buchstaben des Korans",
      "k1-l2-a1": "2.1 Anfangsstellung",
      "k1-l2-a2": "2.2 Mittelstellung",
      "k1-l2-a3": "2.3 Endstellung",
      "k1-l3-a1-ue2": "3.1.2 Die Buchstaben mit Fetha",
      "k1-l3-a1-ue3": "3.1.3 Buchstabengruppen mit Fetha",
      "k1-l3-a1-ue4": "3.1.4 Abschluss mit Fetha",
      "k1-l3-a2-ue2": "3.2.2 Die Buchstaben mit Kesra",
      "k1-l3-a2-ue3": "3.2.3 Buchstabengruppen mit Kesra",
      "k1-l3-a2-ue4": "3.2.4 Abschluss mit Kesra",
      "k1-l3-a3-ue2": "3.3.2 Die Buchstaben mit Damme",
      "k1-l3-a3-ue3": "3.3.3 Buchstabengruppen mit Damme",
      "k1-l3-a3-ue4": "3.3.4 Abschluss mit Damme",
      "k1-l4-a1-ue2": "4.1.2 Übungen mit Dehnungs-Elif",
      "k1-l4-a2-ue2": "4.2.2 Übungen mit Dehnungs-Ye",
      "k1-l4-a3-ue2": "4.3.2 Übungen mit Dehnungs-Vav",
      "k1-l4-a4": "4.4 Übungen mit allen Dehnungsbuchstaben",
      "k1-l5-a2": "5.2 Das Dschezm mit einzelnen Buchstaben",
      "k1-l5-a3": "5.3 Das Dschezm in Buchstabengruppen",
      "k1-l6-a2": "6.2 Das Schedde mit einzelnen Buchstaben",
      "k1-l6-a3": "6.3 Das Schedde in Buchstabengruppen",
      "k1-l7-a1-ue2": "7.1.2 Übungen mit Doppel-Fetha",
      "k1-l7-a2-ue2": "7.2.2 Übungen mit Doppel-Kesra",
      "k1-l7-a3-ue2": "7.3.2 Übungen mit Doppel-Damme",
      "k1-l8-a2": "8.2 Übungen mit rundem Te",
      "k1-l9-a2": "9.2 Übungen mit dem Dehnungszeichen",
      "k1-l10-a2": "10.2 Übungen mit dem Verlängerungszeichen",
      "k1-l11-a2": "11.2 Übungen mit Hemze",
      "k1-l12-a1": "12.1 Abschlussübungen"
    }
  };

  function renderTile(label, stats, level, targetId) {
    return `
      <button class="tile" type="button" data-level="${level}" data-id="${targetId}">
        <div class="tile-label">${label}</div>
        <div class="tile-value">${stats.percent}%</div>
        <div class="tile-bar"><span style="width:${stats.percent}%"></span></div>
      </button>
    `;
  }

  function renderOverview() {
    const rows = [];
    if (meta.scope === "chapter") {
      if (meta.chapter === "all") {
        rows.push(renderTile("Alle Kapitel", aggregate(() => true), "chapter", "all"));
      } else {
        rows.push(renderTile(NAMES.chapters[meta.chapter] || "Kapitel", aggregate((e) => e.chapter === meta.chapter), "chapter", meta.chapter));
      }
    }
    if (meta.scope === "lesson") {
      rows.push(renderTile(NAMES.lessons[meta.lesson] || "Lektion", aggregate((e) => e.chapter === meta.chapter && e.lesson === meta.lesson), "lesson", meta.lesson));
    }
    if (meta.scope === "section") {
      rows.push(renderTile(NAMES.sections[meta.section] || "Abschnitt", aggregate((e) => e.chapter === meta.chapter && e.section === meta.section), "section", meta.section));
    }
    if (meta.scope === "exercise") {
      const ex = getExerciseStats(meta.exercise);
      rows.push(renderTile(NAMES.exercises[meta.exercise] || "Übung", { percent: ex.percent }, "exercise", meta.exercise));
    }

    if (!rows.length) {
      container.innerHTML = "";
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    container.innerHTML = `
      <div class="overview-card tile-grid">
        <div class="overview-title">Fortschritt</div>
        ${rows.join("")}
      </div>
    `;

    container.querySelectorAll(".tile").forEach((btn) => {
      btn.addEventListener("click", () => openListModal(btn.dataset.level, btn.dataset.id));
    });
  }

  function renderDashboard() {
    if (meta.scope !== "dashboard") return;
    const allChapters = aggregate(() => true);
    const allLessons = aggregate(() => true);
    const allSections = aggregate(() => true);
    const hasAny = allChapters.percent > 0 || allChapters.completedCount > 0;
    if (!hasAny) {
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    container.innerHTML = `
      <div class="overview-card dashboard">
        <div class="overview-title">Gesamtfortschritt</div>
        <div class="tile-grid">
          ${renderTile("Alle Kapitel", allChapters, "chapter", "all")}
          ${renderTile("Alle Lektionen", allLessons, "lesson", "all")}
          ${renderTile("Alle Abschnitte", allSections, "section", "all")}
        </div>
      </div>
    `;

    container.querySelectorAll(".tile").forEach((btn) => {
      btn.addEventListener("click", () => openListModal(btn.dataset.level, btn.dataset.id));
    });
  }

  function listForLevel(level, id) {
    if (level === "chapter") {
      return {
        overallFilter: () => true,
        items: Object.entries(NAMES.chapters).map(([cid, label]) => ({
          label,
          stats: aggregate((e) => e.chapter === cid)
        }))
      };
    }
    if (level === "lesson") {
      const chapterId = id === "all" ? null : meta.chapter;
      const overallFilter = (e) => (chapterId ? e.chapter === chapterId : true);
      return {
        overallFilter,
        items: Object.entries(NAMES.lessons).map(([lid, label]) => ({
          label,
          stats: aggregate((e) => overallFilter(e) && e.lesson === lid)
        }))
      };
    }
    if (level === "section") {
      const chapterId = id === "all" ? null : meta.chapter;
      const overallFilter = (e) => (chapterId ? e.chapter === chapterId : true);
      return {
        overallFilter,
        items: Object.entries(NAMES.sections).map(([sid, label]) => ({
          id: sid,
          label,
          stats: aggregate((e) => overallFilter(e) && e.section === sid)
        }))
      };
    }
    if (level === "exercise") {
      const sectionId = id === "all" ? null : meta.section;
      const overallFilter = (e) => (sectionId ? e.section === sectionId : true);
      return {
        overallFilter,
        items: Object.entries(NAMES.exercises).map(([eid, label]) => {
          const match = sectionId ? EXERCISES.find((entry) => entry.id === eid && entry.section === sectionId) : true;
          if (!match) return null;
          const ex = getExerciseStats(eid);
          return { label, stats: { percent: ex.percent } };
        }).filter(Boolean)
      };
    }
    return { overallFilter: () => false, items: [] };
  }

  function openListModal(level, id) {
    const { items, overallFilter } = listForLevel(level, id);
    const titleMap = { chapter: "Kapitel", lesson: "Lektion", section: "Abschnitt", exercise: "Übung" };
    const overall = aggregate(overallFilter || (() => true));
    const rows = level === "section"
      ? items.map((item) => {
        const exercises = EXERCISES.filter((entry) => entry.section === item.id);
        const exerciseRows = exercises.map((entry) => {
          const label = NAMES.exercises[entry.id] || entry.id;
          const ex = getExerciseStats(entry.id);
          return `
            <div class="list-subrow">
              <span class="list-label">${label}</span>
              <span class="list-value">${ex.percent}%</span>
            </div>
          `;
        }).join("");
        return `
          <div class="list-group">
            <div class="list-row">
              <span class="list-label">${item.label}</span>
              <span class="list-value">${item.stats.percent}%</span>
            </div>
            ${exerciseRows}
          </div>
        `;
      }).join("")
      : items.map((item) => `
        <div class="list-row">
          <span class="list-label">${item.label}</span>
          <span class="list-value">${item.stats.percent}%</span>
        </div>
      `).join("");
    const overallRow = `
      <div class="list-row total">
        <span class="list-label">Gesamt</span>
        <span class="list-value">${overall.percent}%</span>
      </div>
    `;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay visible";
    overlay.innerHTML = `
      <div class="modal">
        <p class="modal-eyebrow">${titleMap[level]} Übersicht</p>
        <h2 class="modal-title">${titleMap[level]} Fortschritt</h2>
        <div class="modal-list">${overallRow}${rows}</div>
        <div class="modal-actions">
          <button class="modal-btn primary" type="button" data-action="stay">Schließen</button>
        </div>
      </div>
    `;
    overlay.querySelector('[data-action="stay"]').addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  }

  renderOverview();
  renderDashboard();
  window.addEventListener("progress:update", () => {
    renderOverview();
    renderDashboard();
  });
})();

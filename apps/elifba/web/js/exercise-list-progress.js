(() => {
  const rows = document.querySelectorAll("[data-progress-id]");
  if (!rows.length) return;

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

  rows.forEach((row) => {
    const id = row.getAttribute("data-progress-id");
    const percent = getPercent(id);
    row.textContent = `${percent}%`;
  });
})();

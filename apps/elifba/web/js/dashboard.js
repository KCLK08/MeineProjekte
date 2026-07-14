(function () {
  const summaryEl = document.getElementById("dashboard-summary");
  const treeEl = document.getElementById("dashboard-tree");
  if (!summaryEl || !treeEl) return;

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
    if (!raw) return { learned: 0, total: totalBase };
    try {
      const parsed = JSON.parse(raw);
      return {
        learned: Number(parsed.learned) || 0,
        total: Number(parsed.total) || totalBase
      };
    } catch (err) {
      return { learned: 0, total: totalBase };
    }
  }

  function getExerciseStats(id) {
    const seq = readProgress(id, "sequence");
    const shuf = readProgress(id, "shuffle");
    const learned = Math.max(seq.learned, shuf.learned);
    const total = Math.max(seq.total, shuf.total);
    const percent = total ? Math.round((learned / total) * 100) : 0;
    return { learned, total, percent };
  }

  function getModePercent(id, mode) {
    const data = readProgress(id, mode);
    return data.total ? Math.round((data.learned / data.total) * 100) : 0;
  }

  function aggregate(filterFn) {
    let learnedSum = 0;
    let totalSum = 0;
    EXERCISES.filter(filterFn).forEach((entry) => {
      const data = getExerciseStats(entry.id);
      learnedSum += data.learned;
      totalSum += data.total;
    });
    const percent = totalSum ? Math.round((learnedSum / totalSum) * 100) : 0;
    return { percent, learned: learnedSum, total: totalSum };
  }

  function percentForExercise(id) {
    const ex = getExerciseStats(id);
    return ex.percent;
  }

  function renderTree() {
    const chapterId = "elifba";
    const chapterStats = aggregate((e) => e.chapter === chapterId);
    const lessons = Object.keys(NAMES.lessons);

    summaryEl.textContent = `Gesamt: ${chapterStats.percent}% abgeschlossen`;

    const lessonNodes = lessons.map((lessonId) => {
      const lessonStats = aggregate((e) => e.chapter === chapterId && e.lesson === lessonId);
      const sections = Object.entries(NAMES.sections).filter(([sid]) => sid.startsWith(`l${lessonId}-`));

      const sectionNodes = sections.map(([sectionId, sectionLabel]) => {
        const sectionStats = aggregate((e) => e.chapter === chapterId && e.section === sectionId);
        const exercises = EXERCISES.filter((ex) => ex.section === sectionId);
        const exerciseNodes = exercises.map((ex) => {
          const percent = percentForExercise(ex.id);
          const rawLabel = NAMES.exercises[ex.id] || ex.id;
          let label = rawLabel.startsWith(`${sectionLabel} • `)
            ? rawLabel.slice(sectionLabel.length + 3)
            : rawLabel;
          label = label.replace(/\s*•\s*(Reihe|Zufällig)$/i, "");
          return `
            <div class="tree-row level-4">
              <span class="tree-label">${label}</span>
              <span class="tree-pill">${percent}%</span>
            </div>
          `;
        }).join("");

        if (!exerciseNodes || exercises.length <= 1) {
          return `
            <div class="tree-node">
              <div class="tree-row level-3">
                <span class="tree-label">${sectionLabel}</span>
                <span class="tree-pill">${sectionStats.percent}%</span>
              </div>
            </div>
          `;
        }

        return `
          <details class="tree-node collapsible">
          <summary class="tree-row level-3">
            <span class="tree-label">${sectionLabel}</span>
            <span class="tree-pill">${sectionStats.percent}%</span>
            <span class="tree-toggle" aria-hidden="true"></span>
          </summary>
            <div class="tree-children">
              ${exerciseNodes}
            </div>
          </details>
        `;
      }).join("");

      return `
        <details class="tree-node collapsible">
          <summary class="tree-row level-2">
            <span class="tree-label">${NAMES.lessons[lessonId]}</span>
            <span class="tree-pill">${lessonStats.percent}%</span>
            <span class="tree-toggle" aria-hidden="true"></span>
          </summary>
          <div class="tree-children">
            ${sectionNodes}
          </div>
        </details>
      `;
    }).join("");

    treeEl.innerHTML = `
      <details class="tree-node collapsible" open>
        <summary class="tree-row level-1">
          <span class="tree-label">${NAMES.chapters[chapterId]}</span>
          <span class="tree-pill">${chapterStats.percent}%</span>
          <span class="tree-toggle" aria-hidden="true"></span>
        </summary>
        <div class="tree-children">
          ${lessonNodes}
        </div>
      </details>
    `;

    const collapsibles = treeEl.querySelectorAll(".collapsible");
    collapsibles.forEach((node, index) => {
      node.open = index === 0;
      node.dataset.state = node.open ? "open" : "closed";
      const toggleEl = node.querySelector(".tree-toggle");
      if (toggleEl) toggleEl.textContent = node.open ? "-" : "+";
      node.addEventListener("toggle", () => {
        node.dataset.state = node.open ? "open" : "closed";
        if (toggleEl) toggleEl.textContent = node.open ? "-" : "+";
      });
    });
  }

  renderTree();
})();

(function () {
  const card = document.getElementById("resume-card");
  const titleEl = document.getElementById("resume-title");
  const footEl = document.getElementById("resume-foot");
  const kickerEl = document.getElementById("resume-kicker");
  const letterEl = document.getElementById("resume-letter");
  const pathEl = document.getElementById("resume-path");
  if (!card || !titleEl || !footEl || !kickerEl || !letterEl || !pathEl) return;

  const STORAGE_PREFIX = "elifba.progress.";
  const ROOT_MARKER = "/ElifBa-v2/";
  const MODES = ["sequence", "shuffle"];
  const LESSON_NAMES = {
    "1": "Die Buchstaben des Korans",
    "2": "Anfangs-, Mittel- und Endstellung",
    "3": "Die Vokalzeichen",
    "4": "Die Dehnungsbuchstaben",
    "5": "Das Dschezm-Zeichen",
    "6": "Das Schedde - Das Verdopplungszeichen",
    "7": "Das Tenwin",
    "8": "Das runde Te",
    "9": "Das Dehnungszeichen",
    "10": "Das Verlängerungszeichen",
    "11": "Das Hemze",
    "12": "Abschluss Elifba"
  };
  const EXERCISES = [
    { id: "k1-l1-a2", lesson: "1", label: "Lerne die Buchstaben des Korans", path: "kapitel/elifba/lektion-1/abschnitt-2/buchstaben1.html" },
    { id: "k1-l2-a1", lesson: "2", label: "Anfangsstellung", path: "kapitel/elifba/lektion-2/abschnitt-1/anfangsstellung.html" },
    { id: "k1-l2-a2", lesson: "2", label: "Mittelstellung", path: "kapitel/elifba/lektion-2/abschnitt-2/mittelstellung.html" },
    { id: "k1-l2-a3", lesson: "2", label: "Endstellung", path: "kapitel/elifba/lektion-2/abschnitt-3/endstellung.html" },
    { id: "k1-l3-a1-ue2", lesson: "3", label: "Die Buchstaben mit Fetha", path: "kapitel/elifba/lektion-3/abschnitt-1/uebung-2/fetha1.html" },
    { id: "k1-l3-a1-ue3", lesson: "3", label: "Buchstabengruppen mit Fetha", path: "kapitel/elifba/lektion-3/abschnitt-1/uebung-3/fetha2.html" },
    { id: "k1-l3-a1-ue4", lesson: "3", label: "Abschluss mit Fetha", path: "kapitel/elifba/lektion-3/abschnitt-1/uebung-4/fetha3.html" },
    { id: "k1-l3-a2-ue2", lesson: "3", label: "Die Buchstaben mit Kesra", path: "kapitel/elifba/lektion-3/abschnitt-2/uebung-2/kesra1.html" },
    { id: "k1-l3-a2-ue3", lesson: "3", label: "Buchstabengruppen mit Kesra", path: "kapitel/elifba/lektion-3/abschnitt-2/uebung-3/kesra2.html" },
    { id: "k1-l3-a2-ue4", lesson: "3", label: "Abschluss mit Kesra", path: "kapitel/elifba/lektion-3/abschnitt-2/uebung-4/kesra3.html" },
    { id: "k1-l3-a3-ue2", lesson: "3", label: "Die Buchstaben mit Damme", path: "kapitel/elifba/lektion-3/abschnitt-3/uebung-2/damme1.html" },
    { id: "k1-l3-a3-ue3", lesson: "3", label: "Buchstabengruppen mit Damme", path: "kapitel/elifba/lektion-3/abschnitt-3/uebung-3/damme2.html" },
    { id: "k1-l3-a3-ue4", lesson: "3", label: "Abschluss mit Damme", path: "kapitel/elifba/lektion-3/abschnitt-3/uebung-4/damme3.html" },
    { id: "k1-l4-a1-ue2", lesson: "4", label: "Übungen mit Dehnungs-Elif", path: "kapitel/elifba/lektion-4/abschnitt-1/uebung-2/dehnungs-elif.html" },
    { id: "k1-l4-a2-ue2", lesson: "4", label: "Übungen mit Dehnungs-Ye", path: "kapitel/elifba/lektion-4/abschnitt-2/uebung-2/dehnungs-ye.html" },
    { id: "k1-l4-a3-ue2", lesson: "4", label: "Übungen mit Dehnungs-Vav", path: "kapitel/elifba/lektion-4/abschnitt-3/uebung-2/dehnungs-vav.html" },
    { id: "k1-l4-a4", lesson: "4", label: "Übungen mit allen Dehnungsbuchstaben", path: "kapitel/elifba/lektion-4/abschnitt-4/alle-dehnungen.html" },
    { id: "k1-l5-a2", lesson: "5", label: "Das Dschezm mit einzelnen Buchstaben", path: "kapitel/elifba/lektion-5/abschnitt-2/dschemz-einzelne.html" },
    { id: "k1-l5-a3", lesson: "5", label: "Das Dschezm in Buchstabengruppen", path: "kapitel/elifba/lektion-5/abschnitt-3/dschemz-gruppen.html" },
    { id: "k1-l6-a2", lesson: "6", label: "Das Schedde mit einzelnen Buchstaben", path: "kapitel/elifba/lektion-6/abschnitt-2/schedde-einzelne.html" },
    { id: "k1-l6-a3", lesson: "6", label: "Das Schedde in Buchstabengruppen", path: "kapitel/elifba/lektion-6/abschnitt-3/schedde-gruppen.html" },
    { id: "k1-l7-a1-ue2", lesson: "7", label: "Übungen mit Doppel-Fetha", path: "kapitel/elifba/lektion-7/abschnitt-1/uebung-2/doppel-fetha.html" },
    { id: "k1-l7-a2-ue2", lesson: "7", label: "Übungen mit Doppel-Kesra", path: "kapitel/elifba/lektion-7/abschnitt-2/uebung-2/doppel-kesra.html" },
    { id: "k1-l7-a3-ue2", lesson: "7", label: "Übungen mit Doppel-Damme", path: "kapitel/elifba/lektion-7/abschnitt-3/uebung-2/doppel-damme.html" },
    { id: "k1-l8-a2", lesson: "8", label: "Übungen mit rundem Te", path: "kapitel/elifba/lektion-8/abschnitt-2/rundes-te.html" },
    { id: "k1-l9-a2", lesson: "9", label: "Übungen mit dem Dehnungszeichen", path: "kapitel/elifba/lektion-9/abschnitt-2/dehnungszeichen.html" },
    { id: "k1-l10-a2", lesson: "10", label: "Übungen mit dem Verlängerungszeichen", path: "kapitel/elifba/lektion-10/abschnitt-2/verlaengerungszeichen.html" },
    { id: "k1-l11-a2", lesson: "11", label: "Übungen mit Hemze", path: "kapitel/elifba/lektion-11/abschnitt-2/hemze.html" },
    { id: "k1-l12-a1", lesson: "12", label: "Abschlussübungen", path: "kapitel/elifba/lektion-12/abschnitt-1/abschlussuebungen.html" }
  ];
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

  function toRootRelative(pathLike) {
    if (!pathLike) return null;
    try {
      const url = new URL(pathLike, window.location.href);
      const path = url.pathname.replace(/\\/g, "/");
      const idx = path.indexOf(ROOT_MARKER);
      return idx !== -1 ? path.slice(idx + ROOT_MARKER.length) : path.replace(/^\/+/, "");
    } catch (err) {
      const path = String(pathLike).replace(/\\/g, "/");
      const idx = path.indexOf(ROOT_MARKER);
      return idx !== -1 ? path.slice(idx + ROOT_MARKER.length) : path.replace(/^\/+/, "");
    }
  }

  function resolveHref(pathLike) {
    if (!pathLike) return null;
    if (/^https?:/i.test(pathLike)) return pathLike;
    if (pathLike.startsWith("/") && pathLike.includes("/kapitel/")) return pathLike;
    if (pathLike.startsWith("/") && !pathLike.includes("/kapitel/")) {
      pathLike = pathLike.replace(/^\/+/, "");
    }
    const currentPath = window.location.pathname.replace(/\\/g, "/");
    let basePrefix = "";
    const markerIdx = currentPath.indexOf(ROOT_MARKER);
    if (markerIdx !== -1) {
      basePrefix = currentPath.slice(0, markerIdx + ROOT_MARKER.length);
    } else {
      const kapitelIdx = currentPath.indexOf("/kapitel/");
      if (kapitelIdx !== -1) {
        basePrefix = currentPath.slice(0, kapitelIdx + 1);
      } else {
        basePrefix = currentPath.slice(0, currentPath.lastIndexOf("/") + 1);
      }
    }
    return `${basePrefix}${pathLike}`;
  }

  function readProgress(id, mode) {
    if (!id) return { learned: 0, total: 0 };
    const totalBase = (() => {
      const base = TOTALS[id] || 0;
      const raw = localStorage.getItem(`elifba.limit.${id}`);
      if (!raw || raw === "all") return base;
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) return base;
      return Math.min(parsed, base);
    })();
    let raw = localStorage.getItem(`${STORAGE_PREFIX}${id}.${mode}`);
    if (!raw && mode === "sequence") {
      raw = localStorage.getItem(STORAGE_PREFIX + id);
    }
    if (!raw) return { learned: 0, total: totalBase };
    try {
      const parsed = JSON.parse(raw);
      return { learned: Number(parsed.learned) || 0, total: Number(parsed.total) || totalBase };
    } catch (err) {
      return { learned: 0, total: totalBase };
    }
  }

  function combinedProgress(id) {
    const seq = readProgress(id, "sequence");
    const shuf = readProgress(id, "shuffle");
    return { learned: Math.max(seq.learned, shuf.learned), total: Math.max(seq.total, shuf.total) };
  }

  function findById(id) {
    return EXERCISES.find((entry) => entry.id === id) || null;
  }

  function findByPath(path) {
    if (!path) return null;
    return EXERCISES.find((entry) => entry.path === path) || null;
  }

  let session = null;
  try {
    session = JSON.parse(localStorage.getItem("elifba.lastSession") || "null");
  } catch (err) {
    session = null;
  }

  if (!session || !session.path) return;

  const currentPath = toRootRelative(session.path);
  const nextPath = toRootRelative(session.nextPath);
  const sessionMode = session.mode === "shuffle" ? "shuffle" : "sequence";
  const progress = readProgress(session.id, sessionMode);
  const completed = progress.total > 0 && progress.learned >= progress.total;
  const entry = findById(session.id);
  const lessonId = entry ? entry.lesson : null;

  let targetPath = currentPath;
  let labelEntry = entry || findByPath(currentPath);
  let label = labelEntry ? labelEntry.label : "Weiterlernen";

  if (completed && nextPath) {
    const nextEntry = findByPath(nextPath);
    if (nextEntry) {
      targetPath = nextPath;
      label = nextEntry.label;
    } else if (entry) {
      targetPath = entry.path;
      label = entry.label;
    }
  }

  let lessonPercent = 0;
  if (lessonId) {
    let learnedSum = 0;
    let totalSum = 0;
    EXERCISES.filter((item) => item.lesson === lessonId).forEach((item) => {
      const stats = combinedProgress(item.id);
      learnedSum += stats.learned;
      totalSum += stats.total;
    });
    lessonPercent = totalSum ? Math.round((learnedSum / totalSum) * 100) : 0;
  }

  if (!targetPath || !targetPath.includes("kapitel/")) {
    targetPath = entry ? entry.path : "kapitel/elifba/lektion-1/abschnitt-1/buchstaben1.html";
  }

  const lastPrompt = localStorage.getItem(`elifba.lastPrompt.${session.id}`) || "؟";
  const lessonName = lessonId ? LESSON_NAMES[lessonId] : "";
  const shortPath = lessonName ? `Elifba • ${lessonName}` : "Elifba";

  card.setAttribute("href", resolveHref(targetPath));
  kickerEl.textContent = "Mache da weiter wo du aufgehört hast";
  titleEl.textContent = label;
  pathEl.textContent = label ? `${shortPath} • ${label}` : shortPath;
  letterEl.textContent = lastPrompt;
  footEl.textContent = completed && nextPath
    ? "Starte mit der nächsten Frage."
    : "Starte mit deiner letzten Frage.";
})();

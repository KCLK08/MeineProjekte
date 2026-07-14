(function () {
  const dataEl = document.getElementById("letter-data");
  if (!dataEl) return;

  const payload = JSON.parse(dataEl.textContent || "{}");
  const letters = Array.isArray(payload.letters) ? payload.letters : [];
  const targets = Array.isArray(payload.targets) ? payload.targets : [];
  const lispel = Array.isArray(payload.lispel) ? payload.lispel : [];
  const accentGreen = Array.isArray(payload.accentGreen) ? payload.accentGreen : [];
  const audioBase = payload.audioBase || "";
  const nextUrl = payload.nextUrl || null;
  const homeUrl = payload.homeUrl || null;
  const highlightMode = payload.highlightMode || "all";
  const progressId = payload.progressId || null;
  const hideProgressBar = payload.hideProgressBar === true;
  let mode = payload.mode === "shuffle" ? "shuffle" : "sequence";
  const modeStorageKey = progressId ? `elifba.mode.${progressId}` : "elifba.mode.default";
  const modeChangeKey = progressId ? `elifba.modeChange.${progressId}` : null;
  const legacyProgressKey = progressId ? `elifba.progress.${progressId}` : null;
  const cardLimitKey = progressId ? `elifba.limit.${progressId}` : "elifba.limit.default";
  const includeLearnedKey = progressId ? `elifba.includeLearned.${progressId}` : "elifba.includeLearned.default";
  const overrideKey = progressId ? `elifba.override.${progressId}` : "elifba.override.default";
  const overrideOnceKey = progressId ? `elifba.overrideOnce.${progressId}` : "elifba.overrideOnce.default";
  const overrideRaw = sessionStorage.getItem(overrideOnceKey) ? sessionStorage.getItem(overrideKey) : null;
  if (overrideRaw) {
    try {
      const override = JSON.parse(overrideRaw);
      if (override.mode) localStorage.setItem(modeStorageKey, override.mode);
      if (override.limit) localStorage.setItem(cardLimitKey, String(override.limit));
      if (typeof override.includeLearned === "boolean") {
        localStorage.setItem(includeLearnedKey, String(override.includeLearned));
      }
    } catch (err) {
      if (!localStorage.getItem(modeStorageKey)) localStorage.setItem(modeStorageKey, "sequence");
      if (!localStorage.getItem(cardLimitKey)) localStorage.setItem(cardLimitKey, "all");
      if (!localStorage.getItem(includeLearnedKey)) localStorage.setItem(includeLearnedKey, "true");
    }
    sessionStorage.removeItem(overrideOnceKey);
  } else {
    if (!localStorage.getItem(modeStorageKey)) localStorage.setItem(modeStorageKey, "sequence");
    if (!localStorage.getItem(cardLimitKey)) localStorage.setItem(cardLimitKey, "all");
    if (!localStorage.getItem(includeLearnedKey)) localStorage.setItem(includeLearnedKey, "true");
  }
  const batchKey = progressId ? `elifba.batch.${progressId}.${mode}` : null;

  const savedMode = localStorage.getItem(modeStorageKey);
  if (savedMode === "shuffle" || savedMode === "sequence") {
    mode = savedMode;
  }
  const progressStorageKey = progressId ? `elifba.progress.${progressId}.${mode}` : null;
  const sessionResetKey = progressId ? `elifba.sessionReset.${progressId}.${mode}` : null;
  const redoSessionKey = progressId ? `elifba.redo.${progressId}.${mode}` : null;
  const repeatBatchKey = progressId ? `elifba.repeatBatch.${progressId}.${mode}` : null;
  const repeatCursorKey = progressId ? `elifba.repeatCursor.${progressId}.${mode}` : null;
  const repeatStatsKey = progressId ? `elifba.repeatStats.${progressId}.${mode}` : null;
  const repeatSessionKey = progressId ? `elifba.repeatSession.${progressId}.${mode}` : null;
  const repeatOnceKey = progressId ? `elifba.repeatOnce.${progressId}.${mode}` : null;
  const savedLimit = localStorage.getItem(cardLimitKey);
  let cardLimit = "all";
  if (savedLimit === "all") {
    cardLimit = "all";
  } else if (savedLimit) {
    const parsedLimit = Number(savedLimit);
    if (Number.isFinite(parsedLimit) && parsedLimit > 0) {
      cardLimit = parsedLimit;
    }
  }
  const savedIncludeLearned = localStorage.getItem(includeLearnedKey);
  let includeLearned = savedIncludeLearned === "true";

  const ROOT_MARKER = "/ElifBa-v2/";
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

  if (progressId) {
    const currentPath = toRootRelative(window.location.pathname);
    const nextPath = toRootRelative(nextUrl);
    const payloadState = {
      id: progressId,
      path: currentPath,
      nextPath: nextPath,
      mode: mode
    };
    localStorage.setItem("elifba.lastSession", JSON.stringify(payloadState));
  }

  function getLessonOverviewUrl() {
    const rootPath = toRootRelative(window.location.pathname);
    const lessonMatch = rootPath.match(/kapitel\/elifba\/lektion-(\d+)\//);
    const lessonId = lessonMatch ? lessonMatch[1] : getLessonIdFromProgressId(progressId);
    const basePrefix = rootPath.includes("kapitel/elifba/")
      ? rootPath.slice(0, rootPath.indexOf("kapitel/elifba/"))
      : "";
    const map = {
      "1": `${basePrefix}kapitel/elifba/lektion-1/lektion1.html`,
      "2": `${basePrefix}kapitel/elifba/lektion-2/lektion2.html`,
      "3": `${basePrefix}kapitel/elifba/lektion-3/lektion3.html`,
      "4": `${basePrefix}kapitel/elifba/lektion-4/lektion4.html`,
      "5": `${basePrefix}kapitel/elifba/lektion-5/lektion5.html`,
      "6": `${basePrefix}kapitel/elifba/lektion-6/lektion6.html`,
      "7": `${basePrefix}kapitel/elifba/lektion-7/lektion7.html`,
      "8": `${basePrefix}kapitel/elifba/lektion-8/lektion8.html`,
      "9": `${basePrefix}kapitel/elifba/lektion-9/lektion9.html`,
      "10": `${basePrefix}kapitel/elifba/lektion-10/lektion10.html`,
      "11": `${basePrefix}kapitel/elifba/lektion-11/lektion11.html`,
      "12": `${basePrefix}kapitel/elifba/lektion-12/lektion12.html`
    };
    const rel = lessonId ? map[lessonId] : null;
    if (!rel) return homeUrl;
    const absolutePath = `/${rel.replace(/^\/+/, "")}`;
    return new URL(absolutePath, window.location.href).toString();
  }

  const lessonOverviewUrl = getLessonOverviewUrl();

  const REQUIRED_CORRECT = 3;
  const RED_POS = 3;
  const YELLOW_POS = 9;
  const MODE_LABELS = { sequence: "Reihenfolge", shuffle: "Zufällig" };
  const EXERCISES = [
    { id: "k1-l1-a2", lesson: "1", total: 29 },
    { id: "k1-l2-a1", lesson: "2", total: 29 },
    { id: "k1-l2-a2", lesson: "2", total: 29 },
    { id: "k1-l2-a3", lesson: "2", total: 29 },
    { id: "k1-l3-a1-ue2", lesson: "3", total: 28 },
    { id: "k1-l3-a1-ue3", lesson: "3", total: 42 },
    { id: "k1-l3-a1-ue4", lesson: "3", total: 30 },
    { id: "k1-l3-a2-ue2", lesson: "3", total: 28 },
    { id: "k1-l3-a2-ue3", lesson: "3", total: 42 },
    { id: "k1-l3-a2-ue4", lesson: "3", total: 56 },
    { id: "k1-l3-a3-ue2", lesson: "3", total: 29 },
    { id: "k1-l3-a3-ue3", lesson: "3", total: 20 },
    { id: "k1-l3-a3-ue4", lesson: "3", total: 15 },
    { id: "k1-l4-a1-ue2", lesson: "4", total: 0 },
    { id: "k1-l4-a2-ue2", lesson: "4", total: 0 },
    { id: "k1-l4-a3-ue2", lesson: "4", total: 0 },
    { id: "k1-l4-a4", lesson: "4", total: 0 },
    { id: "k1-l5-a2", lesson: "5", total: 0 },
    { id: "k1-l5-a3", lesson: "5", total: 0 },
    { id: "k1-l6-a2", lesson: "6", total: 0 },
    { id: "k1-l6-a3", lesson: "6", total: 0 },
    { id: "k1-l7-a1-ue2", lesson: "7", total: 0 },
    { id: "k1-l7-a2-ue2", lesson: "7", total: 0 },
    { id: "k1-l7-a3-ue2", lesson: "7", total: 0 },
    { id: "k1-l8-a2", lesson: "8", total: 0 },
    { id: "k1-l9-a2", lesson: "9", total: 0 },
    { id: "k1-l10-a2", lesson: "10", total: 0 },
    { id: "k1-l11-a2", lesson: "11", total: 0 },
    { id: "k1-l12-a1", lesson: "12", total: 0 }
  ];


  let batchStart = 0;
  let repeatCursor = 0;
  if (batchKey) {
    const raw = localStorage.getItem(batchKey);
    const parsed = Number(raw);
    if (Number.isFinite(parsed) && parsed >= 0) {
      batchStart = parsed;
    }
  }
  if (batchStart >= letters.length) {
    batchStart = 0;
    if (batchKey) localStorage.setItem(batchKey, "0");
  }

  const state = {
    stats: {},
    queue: [],
  };
  let currentAudio = null;
  const learnedBaseline = new Set();
  const repeatLearned = new Set();
  let hasAnsweredThisSession = false;
  let isRepeatMode = false;
  let suppressLeavePrompt = false;
  let leavePromptOpen = false;
  let backGuardInitialized = false;

  function allowPageLeave() {
    suppressLeavePrompt = true;
  }

  function goToUrl(url) {
    if (!url) return;
    allowPageLeave();
    window.location.href = url;
  }

  function reloadPage() {
    allowPageLeave();
    window.location.reload();
  }

  function shouldIncludeLearned() {
    return includeLearned || cardLimit === "all";
  }

  function isLearned(idx) {
    if (state.stats[idx]?.status === "gelernt") return true;
    if (isRepeatMode) return repeatLearned.has(idx);
    return learnedBaseline.has(idx);
  }

  function getUnlearnedIndices() {
    return letters.map((_, i) => i).filter((idx) => !isLearned(idx));
  }

  function getLearnedIndices() {
    return letters.map((_, i) => i).filter((idx) => isLearned(idx));
  }

  function resetBatchDisplayStats() {
    if (!includeLearned || cardLimit === "all") return;
    activeIndices.forEach((idx) => {
      if (learnedBaseline.has(idx)) {
        state.stats[idx] = { status: "unbeantwortet", correctCount: 0 };
      }
    });
  }

  function persistRepeatLearned() {
    if (!isRepeatMode || !repeatStatsKey) return;
    sessionStorage.setItem(repeatStatsKey, JSON.stringify([...repeatLearned]));
  }

  function getActiveIndices() {
    const base = letters.map((_, i) => i);
    if (cardLimit === "all") return base;
    if (isRepeatMode) {
      const start = Math.max(0, Math.min(repeatCursor, base.length));
      const ordered = base.slice(start).concat(base.slice(0, start));
      return ordered.slice(0, cardLimit);
    }
    const unlearned = getUnlearnedIndices();
    if (!includeLearned) {
      return unlearned.slice(0, cardLimit);
    }
    if (unlearned.length >= cardLimit) {
      return unlearned.slice(0, cardLimit);
    }
    const learned = getLearnedIndices();
    const needed = Math.max(cardLimit - unlearned.length, 0);
    return unlearned.concat(learned.slice(0, needed));
  }

  let activeIndices = getActiveIndices();
  let batchIndices = [...activeIndices];

  function getLessonIdFromProgressId(id) {
    if (!id) return null;
    const match = id.match(/-l(\d+)/);
    return match ? match[1] : null;
  }

  function getExerciseMeta(id) {
    return EXERCISES.find((entry) => entry.id === id) || null;
  }

  function getLimitForExercise(id) {
    const meta = getExerciseMeta(id);
    const base = meta ? meta.total : activeIndices.length;
    const raw = localStorage.getItem(`elifba.limit.${id}`);
    if (!raw || raw === "all") return base;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed <= 0) return base;
    return Math.min(parsed, base);
  }

  function readModeProgress(id, targetMode) {
    if (!id) return { learned: 0, total: 0 };
    const totalBase = getLimitForExercise(id);
    let raw = localStorage.getItem(`elifba.progress.${id}.${targetMode}`);
    if (!raw && targetMode === "sequence") {
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

  function getExerciseCombinedPercent(id) {
    const seq = readModeProgress(id, "sequence");
    const shuf = readModeProgress(id, "shuffle");
    const learned = Math.max(seq.learned, shuf.learned);
    const total = Math.max(seq.total, shuf.total);
    return total ? Math.round((learned / total) * 100) : 0;
  }

  function getLessonCombinedPercent(lessonId) {
    if (!lessonId) return 0;
    let learnedSum = 0;
    let totalSum = 0;
    EXERCISES.filter((entry) => entry.lesson === lessonId).forEach((entry) => {
      const seq = readModeProgress(entry.id, "sequence");
      const shuf = readModeProgress(entry.id, "shuffle");
      learnedSum += Math.max(seq.learned, shuf.learned);
      totalSum += Math.max(seq.total, shuf.total);
    });
    return totalSum ? Math.round((learnedSum / totalSum) * 100) : 0;
  }

  const letterEl = document.getElementById("current-letter");
  const learnedEl = document.getElementById("learned-text");
  const learnedTotalEl = document.getElementById("learned-total");
  const barEl = document.getElementById("progress-bar");
  const doneEl = document.getElementById("completion");
  let modalEl = null;
  let infoModalEl = null;
  let resetModalEl = null;
  let settingsModalEl = null;
  let completedModalEl = null;
  let batchModalEl = null;
  let repeatCompleteModalEl = null;
  let baselineProgress = null;
  let repeatBatchOnly = false;
  let loadedCompleted = false;
  let lastBatchIndices = [];

  function buildModal(kind, options) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal">
        <p class="modal-eyebrow">${options.eyebrow}</p>
        <h2 class="modal-title">${options.title}</h2>
        <p class="modal-text">${options.text}</p>
        <div class="modal-actions">
          ${options.actions}
        </div>
      </div>
    `;

    overlay.querySelectorAll("[data-action]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const action = btn.getAttribute("data-action");
        if (action === "next" && nextUrl) goToUrl(nextUrl);
        if (action === "home" && homeUrl) goToUrl(homeUrl);
        if (action === "lesson" && lessonOverviewUrl) goToUrl(lessonOverviewUrl);
        if (action === "stay") overlay.classList.remove("visible");
        if (action === "leave") {
          const target = options.leaveHref;
          if (target) goToUrl(target);
        }
        if (action === "redo") {
          const target = options.redoKey;
          if (target) sessionStorage.setItem(target, "1");
          if (sessionResetKey) sessionStorage.setItem(sessionResetKey, "1");
          overlay.classList.remove("visible");
          reloadPage();
        }
        if (action === "reset") {
          overlay.classList.remove("visible");
          resetProgress();
        }
        if (options.onAction) {
          options.onAction(action, overlay);
        }
      });
    });

    document.body.appendChild(overlay);
    return overlay;
  }

  function buildCompleteModal() {
    const repeatAction = cardLimit === "all" ? "redo" : "repeat-batch";
    const repeatLabel = cardLimit === "all" ? "Alle wiederholen" : "Batch wiederholen";
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="${repeatAction}">${repeatLabel}</button>
      <button class="modal-btn ghost" type="button" data-action="repeat-all">Komplette Übung wiederholen</button>
      <button class="modal-btn ghost" type="button" data-action="lesson">Zurück zur Lektionsübersicht</button>
      <button class="modal-btn primary" type="button" data-action="next">Weiter zur nächsten Übung</button>
    `;
    const overlay = buildModal("complete", {
      eyebrow: "Glückwunsch",
      title: "Abschnitt abgeschlossen",
      text: "Du hast diesen Abschnitt abgeschlossen.",
      actions,
      redoKey: redoSessionKey,
      onAction(action) {
        if (action === "repeat-all") {
          if (repeatStatsKey) sessionStorage.removeItem(repeatStatsKey);
          if (repeatCursorKey) sessionStorage.removeItem(repeatCursorKey);
          if (repeatSessionKey) sessionStorage.removeItem(repeatSessionKey);
          sessionStorage.setItem(overrideKey, JSON.stringify({ mode: mode, limit: cardLimit, includeLearned }));
          sessionStorage.setItem(overrideOnceKey, "1");
          reloadPage();
          return;
        }
        if (action !== "repeat-batch") return;
        const snapshot = lastBatchIndices.length ? lastBatchIndices : batchIndices;
        if (repeatBatchKey) sessionStorage.setItem(repeatBatchKey, JSON.stringify(snapshot));
        if (repeatOnceKey) sessionStorage.setItem(repeatOnceKey, "1");
        if (isRepeatMode) {
          snapshot.forEach((idx) => repeatLearned.delete(idx));
          persistRepeatLearned();
          if (repeatCursorKey) sessionStorage.setItem(repeatCursorKey, String(repeatCursor));
          if (repeatSessionKey) sessionStorage.setItem(repeatSessionKey, "1");
        }
        if (sessionResetKey) sessionStorage.setItem(sessionResetKey, "1");
        sessionStorage.setItem(overrideKey, JSON.stringify({ mode: mode, limit: cardLimit, includeLearned }));
        sessionStorage.setItem(overrideOnceKey, "1");
        reloadPage();
      }
    });
    overlay.classList.add("celebrate");
    const nextBtn = overlay.querySelector('[data-action="next"]');
    if (!nextUrl) {
      nextBtn.disabled = true;
      nextBtn.classList.add("disabled");
    }
    return overlay;
  }

  function buildRepeatCompleteModal() {
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="repeat-all">Komplette Übung wiederholen</button>
      <button class="modal-btn ghost" type="button" data-action="repeat-batch">Batch wiederholen</button>
      <button class="modal-btn ghost" type="button" data-action="lesson">Zurück zur Lektionsübersicht</button>
      <button class="modal-btn primary" type="button" data-action="next">Weiter zur nächsten Übung</button>
    `;
    const overlay = buildModal("repeat-complete", {
      eyebrow: "Glückwunsch",
      title: "Wiederholung abgeschlossen",
      text: "Du hast alle Karten in dieser Wiederholung erfolgreich gelernt.",
      actions,
      onAction(action) {
        if (action === "repeat-all") {
          if (repeatStatsKey) sessionStorage.removeItem(repeatStatsKey);
          if (repeatCursorKey) sessionStorage.removeItem(repeatCursorKey);
          if (repeatSessionKey) sessionStorage.removeItem(repeatSessionKey);
          reloadPage();
        }
        if (action === "repeat-batch") {
          const snapshot = lastBatchIndices.length ? lastBatchIndices : batchIndices;
          if (repeatBatchKey) sessionStorage.setItem(repeatBatchKey, JSON.stringify(snapshot));
          if (repeatOnceKey) sessionStorage.setItem(repeatOnceKey, "1");
          snapshot.forEach((idx) => repeatLearned.delete(idx));
          persistRepeatLearned();
          if (repeatCursorKey) sessionStorage.setItem(repeatCursorKey, String(repeatCursor));
          if (repeatSessionKey) sessionStorage.setItem(repeatSessionKey, "1");
          if (sessionResetKey) sessionStorage.setItem(sessionResetKey, "1");
          sessionStorage.setItem(overrideKey, JSON.stringify({ mode: mode, limit: cardLimit, includeLearned }));
          sessionStorage.setItem(overrideOnceKey, "1");
          reloadPage();
        }
      }
    });
    overlay.classList.add("celebrate");
    const nextBtn = overlay.querySelector('[data-action="next"]');
    if (!nextUrl) {
      nextBtn.disabled = true;
      nextBtn.classList.add("disabled");
    }
    return overlay;
  }

  function buildLeaveModal(options) {
    const leaveHref = options?.leaveHref || null;
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="stay">Weiter lernen</button>
      <button class="modal-btn primary" type="button" data-action="leave">Verlassen</button>
    `;
    return buildModal("leave", {
      eyebrow: "Fortschritt behalten",
      title: "Lernen wirklich verlassen?",
      text: "Wenn du jetzt zurückgehst, geht dein Fortschritt in dieser Übung verloren.",
      actions,
      leaveHref,
      onAction(action, overlay) {
        if (action === "stay") {
          leavePromptOpen = false;
          if (options?.onStay) options.onStay();
          overlay.remove();
          return;
        }
        if (action === "leave") {
          leavePromptOpen = false;
          overlay.remove();
          if (options?.onLeave) options.onLeave();
        }
      }
    });
  }

  function buildInfoModal() {
    const actions = `
      <button class="modal-btn primary" type="button" data-action="stay">Verstanden</button>
    `;
    return buildModal("info", {
      eyebrow: "So funktioniert der Fortschrittsbalken",
      title: "Dein Lernfortschritt im Überblick",
      text: `
        <div class="help-text">
          <p>Jedes Segment steht für eine Lernkarte.</p>
          <div class="help-grid">
            <span class="help-color green">Grün</span>
            <span class="help-desc">Richtig beantwortet und im Balken ganz rechts platziert.</span>
            <span class="help-visual">
              <span class="mini-bar">
                <span class="mini-seg"></span>
                <span class="mini-seg"></span>
                <span class="mini-seg"></span>
                <span class="mini-seg"></span>
                <span class="mini-seg green"></span>
              </span>
            </span>

            <span class="help-color red">Rot</span>
            <span class="help-desc">Falsch beantwortet und wird nach 3 weiteren Fragen erneut abgefragt.</span>
            <span class="help-visual">
              <span class="mini-bar">
                <span class="mini-seg"></span>
                <span class="mini-seg"></span>
                <span class="mini-seg"></span>
                <span class="mini-seg red"></span>
                <span class="mini-seg"></span>
              </span>
            </span>

            <span class="help-color yellow">Gelb</span>
            <span class="help-desc">Unsicher beantwortet oder eine zuvor rote Frage wurde richtig beantwortet. Gelb wird nach 9 weiteren Fragen erneut abgefragt. Rot wird zuerst zu Gelb, dann zu Grün.</span>
            <span class="help-visual">
              <span class="mini-bar">
                <span class="mini-seg"></span>
                <span class="mini-seg"></span>
                <span class="mini-seg"></span>
                <span class="mini-dots">...</span>
                <span class="mini-seg"></span>
                <span class="mini-seg yellow"></span>
                <span class="mini-seg green"></span>
              </span>
            </span>

            <span class="help-color dark-green">Dunkelgrün</span>
            <span class="help-desc">Gelernt. Normal nach 3 richtigen Antworten. Nach Gelb sind 4 richtige Antworten nötig, nach Rot 5 richtige Antworten.</span>
            <span class="help-visual">
              <span class="mini-stack">
                <span class="mini-bar">
                  <span class="mini-seg red"></span>
                  <span class="mini-seg yellow"></span>
                  <span class="mini-seg green"></span>
                  <span class="mini-seg green"></span>
                </span>
                <span class="mini-bar">
                  <span class="mini-seg dark-green"></span>
                </span>
              </span>
            </span>
          </div>
        </div>
      `,
      actions,
    });
  }

  function buildSettingsModal() {
    let pendingMode = mode;
    let pendingLimit = cardLimit;
    let pendingInclude = includeLearned;
    const currentLabel = mode === "shuffle" ? "Zufällig" : "Reihenfolge";
    const limitLabel = cardLimit === "all" ? "Alle" : `${cardLimit}`;
    const includeLabel = includeLearned ? "anzeigen" : "ausblenden";
    const limitOptions = [10, 20, 30].filter((value) => value <= letters.length);
    const limitButtons = limitOptions.map((value) => `
      <button class="modal-btn ghost option-btn" type="button" data-action="limit" data-value="${value}">${value}</button>
    `).join("");
    const actions = `
      <div class="modal-group">
        <div class="modal-subtitle-row">
          <p class="modal-subtitle">Abfrage-Modus</p>
          <span class="info-tip" tabindex="0" data-tooltip="Reihenfolge fragt die Karten in der Listenreihenfolge ab. Zufällig mischt die Reihenfolge neu.">i</span>
        </div>
        <div class="modal-inline">
          <button class="modal-btn ghost option-btn" type="button" data-action="mode" data-value="sequence">Reihenfolge</button>
          <button class="modal-btn ghost option-btn" type="button" data-action="mode" data-value="shuffle">Zufällig</button>
        </div>
      </div>
      <div class="modal-group">
        <div class="modal-subtitle-row">
          <p class="modal-subtitle">Bereits gelernte Karten</p>
          <span class="info-tip" tabindex="0" data-tooltip="Du kannst gelernte Karten ausblenden, um dich auf neue Karten zu konzentrieren.">i</span>
        </div>
        <div class="modal-inline">
          <button class="modal-btn ghost option-btn" type="button" data-action="include" data-value="true">Anzeigen</button>
          <button class="modal-btn ghost option-btn" type="button" data-action="include" data-value="false">Nicht anzeigen</button>
        </div>
        <p class="modal-warning" id="settings-warning"></p>
      </div>
      <div class="modal-group">
        <div class="modal-subtitle-row">
          <p class="modal-subtitle">Lernkarten</p>
          <span class="info-tip" tabindex="0" data-tooltip="Du kannst mit einer kleineren Anzahl starten. Später kannst du auf Alle umstellen.">i</span>
        </div>
        <p class="modal-hint">Wie viele Lernkarten willst du lernen?</p>
        <div class="modal-inline">
          ${limitButtons}
          <button class="modal-btn ghost option-btn" type="button" data-action="limit" data-value="all">Alle</button>
        </div>
      </div>
      <div class="modal-actions-row">
        <button class="modal-btn ghost" type="button" data-action="stay">Schließen</button>
        <button class="modal-btn primary" type="button" data-action="apply">Anwenden</button>
      </div>
    `;
    const overlay = buildModal("settings", {
      eyebrow: "Einstellungen",
      title: "Modus und Kartenanzahl",
      text: "",
      actions,
      onAction(action, activeOverlay) {
        if (action === "stay") {
          activeOverlay.classList.remove("visible");
        }
      }
    });

    function updateWarning() {
      const warningEl = overlay.querySelector("#settings-warning");
      if (!warningEl) return;
      const limitValue = pendingLimit === "all" ? "all" : Number(pendingLimit);
      if (limitValue === "all") {
        if (!pendingInclude) {
          warningEl.textContent = "Hinweis: Bei \"Alle\" werden immer alle Karten angezeigt, auch bereits gelernte.";
          warningEl.style.display = "block";
          return;
        }
        warningEl.textContent = "";
        warningEl.style.display = "none";
        return;
      }
      if (pendingInclude) {
        warningEl.textContent = "";
        warningEl.style.display = "none";
        return;
      }
      const remaining = getUnlearnedIndices().length;
      if (Number.isFinite(limitValue) && remaining < limitValue) {
        warningEl.textContent = `Achtung: Es sind nur noch ${remaining} Karten übrig. Mit dieser Auswahl werden keine ${limitValue} Karten angezeigt.`;
        warningEl.style.display = "block";
      } else {
        warningEl.textContent = "";
        warningEl.style.display = "none";
      }
    }

    function updateActive() {
      overlay.querySelectorAll("[data-action=\"mode\"]").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-value") === String(pendingMode));
      });
      overlay.querySelectorAll("[data-action=\"limit\"]").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-value") === String(pendingLimit));
      });
      overlay.querySelectorAll("[data-action=\"include\"]").forEach((btn) => {
        btn.classList.toggle("active", btn.getAttribute("data-value") === String(pendingInclude));
      });
      updateWarning();
    }

    overlay.querySelectorAll("[data-action=\"mode\"]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pendingMode = btn.getAttribute("data-value");
        updateActive();
      });
    });

    overlay.querySelectorAll("[data-action=\"limit\"]").forEach((btn) => {
      const value = btn.getAttribute("data-value");
      btn.addEventListener("click", () => {
        pendingLimit = value === "all" ? "all" : Number(value);
        updateActive();
      });
    });

    overlay.querySelectorAll("[data-action=\"include\"]").forEach((btn) => {
      btn.addEventListener("click", () => {
        pendingInclude = btn.getAttribute("data-value") === "true";
        updateActive();
      });
    });

    overlay.querySelector('[data-action="apply"]').addEventListener("click", () => {
      const modeChanged = pendingMode !== mode;
      const limitChanged = String(pendingLimit) !== String(cardLimit);
      const includeChanged = pendingInclude !== includeLearned;
      if (!modeChanged && !limitChanged && !includeChanged) {
        overlay.classList.remove("visible");
        return;
      }
      const hasAnswered = hasAnsweredThisSession;
      overlay.classList.remove("visible");
      if (!hasAnswered) {
        localStorage.setItem(modeStorageKey, pendingMode);
        localStorage.setItem(cardLimitKey, String(pendingLimit));
        localStorage.setItem(includeLearnedKey, String(pendingInclude));
        sessionStorage.setItem(overrideKey, JSON.stringify({ mode: pendingMode, limit: pendingLimit, includeLearned: pendingInclude }));
        sessionStorage.setItem(overrideOnceKey, "1");
        cloneProgressToMode(pendingMode, pendingLimit);
        markSessionReset(pendingMode);
        reloadPage();
        return;
      }
      const confirmModal = buildSettingsResetModal(pendingMode, pendingLimit, pendingInclude, modeChanged, limitChanged, includeChanged);
      confirmModal.classList.add("visible");
    });

    updateActive();
    updateWarning();
    return overlay;
  }

  function resetAllModes() {
    if (!progressId) return;
    localStorage.removeItem(`elifba.progress.${progressId}.sequence`);
    localStorage.removeItem(`elifba.progress.${progressId}.shuffle`);
    if (legacyProgressKey) localStorage.removeItem(legacyProgressKey);
    if (modeChangeKey) localStorage.removeItem(modeChangeKey);
    if (batchKey) localStorage.removeItem(batchKey);
  }

  function cloneProgressToMode(nextMode, nextLimit) {
    if (!progressId || !progressStorageKey) return;
    const currentRaw = localStorage.getItem(progressStorageKey);
    if (!currentRaw) return;
    const targetKey = `elifba.progress.${progressId}.${nextMode}`;
    try {
      const parsed = JSON.parse(currentRaw);
      const nextStats = parsed.stats ? { ...parsed.stats } : {};
      Object.keys(nextStats).forEach((key) => {
        const entry = nextStats[key];
        if (entry && entry.status !== "gelernt") {
          entry.correctCount = 0;
          if (entry.status !== "unbeantwortet") {
            entry.status = "unbeantwortet";
          }
        }
      });
      const payload = {
        ...parsed,
        limit: nextLimit,
        batchStart: 0,
        queue: [],
        stats: nextStats
      };
      localStorage.setItem(targetKey, JSON.stringify(payload));
    } catch (err) {
      return;
    }
  }

  function markSessionReset(nextMode) {
    if (!progressId) return;
    const key = `elifba.sessionReset.${progressId}.${nextMode}`;
    sessionStorage.setItem(key, "1");
    localStorage.removeItem(`elifba.batch.${progressId}.${nextMode}`);
  }

  function buildModeResetModal(nextMode) {
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="stay">Abbrechen</button>
      <button class="modal-btn primary" type="button" data-action="confirm">Zurücksetzen & wechseln</button>
    `;
    return buildModal("mode-reset", {
      eyebrow: "Modus wechseln",
      title: "Fortschritt zurücksetzen?",
      text: "Beim Wechsel des Modus wird der Fortschritt dieser Übung zurückgesetzt.",
      actions,
      onAction(action, overlay) {
        if (action !== "confirm") return;
        localStorage.setItem(modeStorageKey, nextMode);
        markSessionReset(nextMode);
        overlay.classList.remove("visible");
        reloadPage();
      }
    });
  }

  function buildLimitResetModal(nextLimit) {
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="stay">Abbrechen</button>
      <button class="modal-btn primary" type="button" data-action="confirm">Zurücksetzen & anwenden</button>
    `;
    return buildModal("limit-reset", {
      eyebrow: "Lernkarten anpassen",
      title: "Fortschritt zurücksetzen?",
      text: "Wenn du die Kartenanzahl änderst, wird der Fortschritt dieser Übung zurückgesetzt.",
      actions,
      onAction(action, overlay) {
        if (action !== "confirm") return;
        localStorage.setItem(cardLimitKey, String(nextLimit));
        markSessionReset(mode);
        overlay.classList.remove("visible");
        reloadPage();
      }
    });
  }

  function buildSettingsResetModal(nextMode, nextLimit, nextInclude, modeChanged, limitChanged, includeChanged) {
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="stay">Abbrechen</button>
      <button class="modal-btn primary" type="button" data-action="confirm">Änderungen übernehmen</button>
    `;
    const parts = [];
    if (modeChanged) parts.push("den Modus");
    if (limitChanged) parts.push("die Kartenanzahl");
    if (includeChanged) parts.push("die Anzeige gelernter Karten");
    const changeText = parts.length ? parts.join(" und ") : "die Einstellungen";
    return buildModal("settings-reset", {
      eyebrow: "Einstellungen anwenden",
      title: "Einstellungen übernehmen?",
      text: `Du änderst ${changeText}. Dein Lernstand bleibt erhalten.`,
      actions,
      onAction(action, overlay) {
        if (action !== "confirm") return;
        localStorage.setItem(modeStorageKey, nextMode);
        localStorage.setItem(cardLimitKey, String(nextLimit));
        localStorage.setItem(includeLearnedKey, String(nextInclude));
        sessionStorage.setItem(overrideKey, JSON.stringify({ mode: nextMode, limit: nextLimit, includeLearned: nextInclude }));
        sessionStorage.setItem(overrideOnceKey, "1");
        cloneProgressToMode(nextMode, nextLimit);
        markSessionReset(nextMode);
        overlay.classList.remove("visible");
        reloadPage();
      }
    });
  }

  function buildResetModal() {
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="stay">Abbrechen</button>
      <button class="modal-btn primary" type="button" data-action="reset">Zurücksetzen</button>
    `;
    return buildModal("reset", {
      eyebrow: "Fortschritt zurücksetzen",
      title: "Übung wirklich zurücksetzen?",
      text: "Dein aktueller Fortschritt dieser Übung wird gelöscht.",
      actions,
    });
  }

  function buildCompletedOptionsModal() {
    const repeatAction = cardLimit === "all" ? "redo" : "repeat-batch";
    const repeatLabel = cardLimit === "all" ? "Alle wiederholen" : "Batch wiederholen";
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="${repeatAction}">${repeatLabel}</button>
      <button class="modal-btn ghost" type="button" data-action="lesson">Zurück zur Lektionsübersicht</button>
      <button class="modal-btn primary" type="button" data-action="redo">Übung wiederholen</button>
    `;
    const overlay = buildModal("completed-options", {
      eyebrow: "Glückwunsch",
      title: "Übung bereits abgeschlossen",
      text: "Dieser Abschnitt wurde bereits abgeschlossen. Du kannst ihn wiederholen, wenn du möchtest.",
      actions,
      redoKey: redoSessionKey,
      onAction(action) {
        if (action !== "repeat-batch") return;
        if (repeatBatchKey) sessionStorage.setItem(repeatBatchKey, JSON.stringify(lastBatchIndices));
        if (repeatOnceKey) sessionStorage.setItem(repeatOnceKey, "1");
        if (sessionResetKey) sessionStorage.setItem(sessionResetKey, "1");
        sessionStorage.setItem(overrideKey, JSON.stringify({ mode: mode, limit: cardLimit, includeLearned }));
        sessionStorage.setItem(overrideOnceKey, "1");
        reloadPage();
      }
    });
    overlay.classList.add("celebrate");
    return overlay;
  }

  function buildBatchContinueModal(nextCount, remainingCount, includeFill) {
    const learnedTotal = isRepeatMode
      ? repeatLearned.size
      : letters.filter((_, idx) => state.stats[idx]?.status === "gelernt").length;
    const remainingTotal = isRepeatMode
      ? Math.max(letters.length - learnedTotal, 0)
      : getUnlearnedIndices().length;
    const isGlobalComplete = baselineProgress && baselineProgress.total > 0
      && baselineProgress.learned >= baselineProgress.total;
    const batchSnapshot = batchIndices.length ? [...batchIndices] : [...activeIndices];
    const label = includeFill
      ? `Nächste ${nextCount} Karten`
      : (remainingCount <= nextCount
        ? `Restliche ${remainingCount} Karten`
        : `Nächste ${nextCount} Karten`);
    const hint = includeFill && remainingCount < nextCount
      ? "Die nächsten Karten enthalten auch bereits gelernte."
      : "";
    const actions = `
      <button class="modal-btn ghost" type="button" data-action="repeat-batch">Batch wiederholen</button>
      <button class="modal-btn ghost" type="button" data-action="lesson">Zur Lektionsübersicht</button>
      <button class="modal-btn primary" type="button" data-action="next-batch">${label}</button>
    `;
    const text = isGlobalComplete
      ? `Wiederholungsmodus: Du hast ${learnedTotal} Karten gelernt, ${remainingTotal} verbleiben in dieser Übung.`
      : (remainingTotal === 0
        ? "Alle Karten sind bereits gelernt. Möchtest du weitere Karten wiederholen?"
        : `Du hast ${learnedTotal} Buchstaben gelernt, ${remainingTotal} verbleiben. Möchtest du mit den nächsten Karten weitermachen? ${hint}`.trim());
    return buildModal("batch", {
      eyebrow: "Batch abgeschlossen",
      title: "Weiter mit weiteren Karten?",
      text,
      actions,
      onAction(action, overlay) {
        if (action === "repeat-batch") {
          const snapshot = batchSnapshot.length ? batchSnapshot : activeIndices;
          console.debug("[batch-repeat] click repeat", {
            activeIndices: snapshot,
            mode,
            cardLimit,
            includeLearned
          });
          if (repeatBatchKey) sessionStorage.setItem(repeatBatchKey, JSON.stringify(snapshot));
          if (isRepeatMode) {
            snapshot.forEach((idx) => repeatLearned.delete(idx));
            persistRepeatLearned();
            if (repeatCursorKey) sessionStorage.setItem(repeatCursorKey, String(repeatCursor));
            if (repeatSessionKey) sessionStorage.setItem(repeatSessionKey, "1");
          }
          if (sessionResetKey) sessionStorage.setItem(sessionResetKey, "1");
          sessionStorage.setItem(overrideKey, JSON.stringify({ mode: mode, limit: cardLimit, includeLearned }));
          sessionStorage.setItem(overrideOnceKey, "1");
          overlay.classList.remove("visible");
          reloadPage();
          return;
        }
        if (action !== "next-batch") return;
        if (isRepeatMode && repeatCursorKey && cardLimit !== "all") {
          const step = Number(cardLimit) || 0;
          const total = letters.length;
          const nextCursor = total ? (repeatCursor + step) % total : 0;
          sessionStorage.setItem(repeatCursorKey, String(nextCursor));
          if (repeatSessionKey) sessionStorage.setItem(repeatSessionKey, "1");
          persistRepeatLearned();
        }
        if (batchKey) localStorage.setItem(batchKey, "0");
        sessionStorage.setItem(overrideKey, JSON.stringify({ mode: mode, limit: cardLimit }));
        sessionStorage.setItem(overrideOnceKey, "1");
        overlay.classList.remove("visible");
        reloadPage();
      }
    });
  }

  function initStats() {
    letters.forEach((_, idx) => {
      if (!state.stats[idx]) {
        state.stats[idx] = { status: "unbeantwortet", correctCount: 0 };
      }
    });
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
    return list;
  }

  function initQueue() {
    const base = [...activeIndices];
    state.queue = mode === "shuffle" ? shuffle(base) : base;
  }

  function rebuildQueueFromStats() {
    const remaining = shouldIncludeLearned()
      ? activeIndices
      : activeIndices.filter((idx) => !isLearned(idx));
    state.queue = mode === "shuffle" ? shuffle(remaining) : remaining;
  }

  function loadProgress() {
    if (!progressId) return false;
    const resetSession = sessionResetKey && sessionStorage.getItem(sessionResetKey);
    if (resetSession) sessionStorage.removeItem(sessionResetKey);
    const redoSession = redoSessionKey && sessionStorage.getItem(redoSessionKey);
    if (redoSession) sessionStorage.removeItem(redoSessionKey);
    let repeatList = null;
    if (repeatBatchKey && sessionStorage.getItem(repeatBatchKey)) {
      try {
        repeatList = JSON.parse(sessionStorage.getItem(repeatBatchKey) || "[]");
      } catch (err) {
        repeatList = null;
      }
      sessionStorage.removeItem(repeatBatchKey);
      console.debug("[batch-repeat] loaded repeatList", repeatList);
    }
    let raw = progressStorageKey ? localStorage.getItem(progressStorageKey) : null;
    let fromLegacy = false;
    if (!raw && mode === "sequence" && legacyProgressKey) {
      raw = localStorage.getItem(legacyProgressKey);
      fromLegacy = !!raw;
    }
    if (!raw) return false;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed.stats || !parsed.queue) return false;
      if (!Array.isArray(parsed.queue)) return false;
      const parsedLimit = parsed.limit || "all";
      const limitMatches = String(parsedLimit) === String(cardLimit);
      const wasComplete = parsed.total && parsed.learned === parsed.total;
      baselineProgress = wasComplete
        ? {
            learned: Number(parsed.learned) || 0,
            total: Number(parsed.total) || 0,
            completedCount: Number(parsed.completedCount) || 0,
            completedAt: parsed.completedAt || null
          }
        : null;
      isRepeatMode = wasComplete && !redoSession;
      if (repeatOnceKey && sessionStorage.getItem(repeatOnceKey)) {
        repeatBatchOnly = true;
        sessionStorage.removeItem(repeatOnceKey);
      }
      if (isRepeatMode && repeatCursorKey && sessionStorage.getItem(repeatCursorKey)) {
        const rawCursor = Number(sessionStorage.getItem(repeatCursorKey));
        if (Number.isFinite(rawCursor) && rawCursor >= 0) {
          repeatCursor = rawCursor;
        }
        sessionStorage.removeItem(repeatCursorKey);
      }
      learnedBaseline.clear();
      repeatLearned.clear();
      if (!isRepeatMode) {
        Object.keys(parsed.stats).forEach((key) => {
          const idx = Number(key);
          if (Number.isFinite(idx) && parsed.stats[key]?.status === "gelernt") {
            learnedBaseline.add(idx);
          }
        });
      } else {
        const keepRepeat = repeatSessionKey && sessionStorage.getItem(repeatSessionKey);
        if (!keepRepeat) {
          if (repeatStatsKey) sessionStorage.removeItem(repeatStatsKey);
          repeatCursor = 0;
        } else if (repeatStatsKey) {
          try {
            const savedRepeat = JSON.parse(sessionStorage.getItem(repeatStatsKey) || "[]");
            if (Array.isArray(savedRepeat)) {
              savedRepeat.forEach((idx) => {
                if (Number.isFinite(idx) && idx >= 0 && idx < letters.length) {
                  repeatLearned.add(idx);
                }
              });
            }
          } catch (err) {
            repeatLearned.clear();
          }
          sessionStorage.removeItem(repeatSessionKey);
        }
      }
      if (redoSession) learnedBaseline.clear();
      if (redoSession || wasComplete) {
        state.stats = {};
      } else {
        state.stats = parsed.stats;
      }
      initStats();
      Object.values(state.stats).forEach((entry) => {
        if (entry && entry.status !== "gelernt") {
          entry.correctCount = 0;
          if (entry.status !== "unbeantwortet") entry.status = "unbeantwortet";
        }
      });
      if (Array.isArray(repeatList) && repeatList.length) {
        activeIndices = repeatList.filter((idx) => Number.isFinite(idx) && idx >= 0 && idx < letters.length);
        batchIndices = [...activeIndices];
        activeIndices.forEach((idx) => {
          if (state.stats[idx]) {
            state.stats[idx] = { status: "unbeantwortet", correctCount: 0 };
          }
        });
        state.queue = mode === "shuffle" ? shuffle([...activeIndices]) : [...activeIndices];
        console.debug("[batch-repeat] applied repeatList", { activeIndices, queue: state.queue });
      } else {
        activeIndices = getActiveIndices();
        batchIndices = [...activeIndices];
        resetBatchDisplayStats();
        rebuildQueueFromStats();
      }
      if (!limitMatches) {
        loadedCompleted = false;
        return true;
      }
      if (modeChangeKey && localStorage.getItem(modeChangeKey)) {
        rebuildQueueFromStats();
        localStorage.removeItem(modeChangeKey);
      }
      if (fromLegacy && progressStorageKey) {
        localStorage.setItem(progressStorageKey, raw);
        localStorage.removeItem(legacyProgressKey);
      }
      loadedCompleted = wasComplete && !resetSession && !redoSession;
      return true;
    } catch (err) {
      return false;
    }
  }

  function resetProgress() {
    if (!progressId) return;
    if (progressStorageKey) localStorage.removeItem(progressStorageKey);
    if (legacyProgressKey) localStorage.removeItem(legacyProgressKey);
    if (batchKey) localStorage.removeItem(batchKey);
    baselineProgress = null;
    learnedBaseline.clear();
    initStats();
    initQueue();
    showCurrent();
    window.dispatchEvent(new Event("progress:update"));
  }

  function renderProgressBar() {
    if (!barEl) return;
    barEl.innerHTML = "";
    const barIndices = cardLimit === "all" ? letters.map((_, i) => i) : batchIndices;
    const learnedOrder = barIndices.filter((idx) => state.stats[idx]?.status === "gelernt");

    if (state.queue.length) {
      const queueGroup = document.createElement("div");
      queueGroup.className = "progress-group queue";
      if (learnedOrder.length) queueGroup.classList.add("with-learned");

      state.queue.forEach((idx) => {
        const seg = document.createElement("span");
        seg.className = "progress-seg";
        const st = state.stats[idx].status;
        if (st === "richtig") seg.classList.add("green");
        else if (st === "unsicher") seg.classList.add("yellow");
        else if (st === "falsch") seg.classList.add("red");
        else if (st === "gelernt") seg.classList.add("learned");
        if (state.queue[0] === idx) seg.classList.add("current");
        queueGroup.appendChild(seg);
      });
      barEl.appendChild(queueGroup);
    }

    const learnedGroup = document.createElement("div");
    learnedGroup.className = "progress-group learned";
    if (state.queue.length) learnedGroup.classList.add("with-queue");
    learnedOrder.forEach((idx) => {
      const seg = document.createElement("span");
      seg.className = "progress-seg learned";
      learnedGroup.appendChild(seg);
    });

    if (learnedOrder.length) barEl.appendChild(learnedGroup);
  }

  function updateProgress() {
    const total = letters.length;
    const learned = letters.filter((_, idx) => state.stats[idx]?.status === "gelernt").length;
    if (learnedEl) learnedEl.textContent = "";
    if (learnedTotalEl) learnedTotalEl.textContent = "";
    renderProgressBar();
    if (progressId) {
      if (isRepeatMode) return;
      const prevRaw = progressStorageKey ? localStorage.getItem(progressStorageKey) : null;
      let prev = { completedCount: 0 };
      if (prevRaw) {
        try { prev = JSON.parse(prevRaw); } catch (err) { prev = { completedCount: 0 }; }
      }
      if (learned === 0 && !baselineProgress && prevRaw) {
        window.dispatchEvent(new Event("progress:update"));
        return;
      }
      let completedCount = Number(prev.completedCount) || 0;
      if (baselineProgress && baselineProgress.completedCount) {
        completedCount = Math.max(completedCount, baselineProgress.completedCount);
      }
      if (learned === total && total > 0 && prev.learned !== total) {
        completedCount += 1;
      }
      const learnedToStore = baselineProgress
        ? Math.max(learned, baselineProgress.learned)
        : Math.max(learned, Number(prev.learned) || 0);
      const totalToStore = baselineProgress
        ? Math.max(total, baselineProgress.total)
        : Math.max(total, Number(prev.total) || 0);
      const payload = {
        learned: learnedToStore,
        total: totalToStore,
        limit: cardLimit,
        batchStart,
        updatedAt: Date.now(),
        completedAt: learnedToStore === totalToStore && totalToStore > 0
          ? Date.now()
          : baselineProgress?.completedAt || prev.completedAt || null,
        completedCount,
        stats: state.stats,
        queue: state.queue
      };
      if (progressStorageKey) localStorage.setItem(progressStorageKey, JSON.stringify(payload));
      window.dispatchEvent(new Event("progress:update"));
    }
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function findTargetMatch(word, targetList, mode) {
    let best = null;
    targetList.forEach((t) => {
      if (!t) return;
      let startIndex = 0;
      while (true) {
        const idx = word.indexOf(t, startIndex);
        if (idx === -1) break;
        const end = idx + t.length;
        const isMiddle = idx > 0 && end < word.length;
        if (mode === "initial") {
          if (!best || idx < best.index) best = { index: idx, length: t.length };
        } else if (mode === "final") {
          if (!best || idx > best.index) best = { index: idx, length: t.length };
        } else if (mode === "middle") {
          if (isMiddle && (!best || idx < best.index)) best = { index: idx, length: t.length };
        }
        startIndex = idx + 1;
      }
    });

    if (!best && mode === "middle") {
      // Fallback: first occurrence if no middle match exists.
      targetList.forEach((t) => {
        if (!t || best) return;
        const idx = word.indexOf(t);
        if (idx !== -1) best = { index: idx, length: t.length };
      });
    }

    return best;
  }

  function wrapOnce(word, targetList, mode, className) {
    const match = findTargetMatch(word, targetList, mode);
    if (!match) return null;
    const before = escapeHTML(word.slice(0, match.index));
    const mid = escapeHTML(word.slice(match.index, match.index + match.length));
    const after = escapeHTML(word.slice(match.index + match.length));
    return `${before}<span class="${className}">${mid}</span>${after}`;
  }

  function renderWord(idx) {
    const word = letters[idx] ?? "";
    const target = targets[idx];
    if (!target) {
      if (!lispel.length && !accentGreen.length) {
        letterEl.textContent = word;
        return;
      }

      let marked = escapeHTML(word);
      let changed = false;
      const applyMarks = (list, className) => {
        list.forEach((ch) => {
          if (!ch) return;
          const safe = escapeHTML(ch);
          const regex = new RegExp(safe, "g");
          const next = marked.replace(regex, `<span class="${className}">${safe}</span>`);
          if (next !== marked) {
            changed = true;
            marked = next;
          }
        });
      };
      applyMarks(accentGreen, "accent-green");
      applyMarks(lispel, "lispel");

      if (!changed) {
        letterEl.textContent = word;
      } else {
        letterEl.innerHTML = marked;
      }
      return;
    }

    const targetList = Array.isArray(target) ? target : [target];
    if (highlightMode !== "all") {
      const markedOnce = wrapOnce(word, targetList, highlightMode, "highlight");
      if (markedOnce) {
        letterEl.innerHTML = markedOnce;
        return;
      }
      letterEl.textContent = word;
      return;
    }

    const escaped = escapeHTML(word);
    let marked = escaped;

    targetList.forEach((t) => {
      if (!t) return;
      const safe = escapeHTML(t);
      const regex = new RegExp(safe, "g");
      marked = marked.replace(regex, `<span class="highlight">${safe}</span>`);
    });

    if (marked === escaped) {
      letterEl.textContent = word;
      return;
    }

    letterEl.innerHTML = marked;
  }

  function showCurrent() {
    if (isRepeatMode && repeatLearned.size >= letters.length) {
      if (doneEl) doneEl.style.display = "none";
      if (modalEl) modalEl.classList.remove("visible");
      if (completedModalEl) completedModalEl.classList.remove("visible");
      if (batchModalEl) batchModalEl.classList.remove("visible");
      if (!repeatCompleteModalEl) repeatCompleteModalEl = buildRepeatCompleteModal();
      repeatCompleteModalEl.classList.add("visible");
      letterEl.textContent = "";
      updateProgress();
      return;
    }
    const isComplete = activeIndices.length === 0 || activeIndices.every((i) => state.stats[i]?.status === "gelernt");
    if (isComplete) {
      lastBatchIndices = batchIndices.length ? [...batchIndices] : [...activeIndices];
      if (doneEl) doneEl.style.display = "none";
      if (cardLimit !== "all") {
        const remaining = getUnlearnedIndices().length;
        if (repeatBatchOnly) {
          if (!modalEl) modalEl = buildCompleteModal();
          modalEl.classList.add("visible");
          letterEl.textContent = "";
          updateProgress();
          return;
        }
        if (remaining > 0) {
          const includeFill = includeLearned && cardLimit !== "all";
          const nextCount = includeFill ? cardLimit : Math.min(cardLimit, remaining);
          if (batchModalEl) batchModalEl.remove();
          batchModalEl = buildBatchContinueModal(nextCount, remaining, includeFill);
          batchModalEl.classList.add("visible");
          letterEl.textContent = "";
          updateProgress();
          return;
        }
      }
      if (loadedCompleted) {
        if (!completedModalEl) completedModalEl = buildCompletedOptionsModal();
        completedModalEl.classList.add("visible");
      } else {
        if (!modalEl) modalEl = buildCompleteModal();
        modalEl.classList.add("visible");
      }
      letterEl.textContent = "";
      updateProgress();
      return;
    }

    if (doneEl) doneEl.style.display = "none";
    if (modalEl) modalEl.classList.remove("visible");
    if (completedModalEl) completedModalEl.classList.remove("visible");
    if (batchModalEl) batchModalEl.classList.remove("visible");
    if (!state.queue.length) {
      letterEl.textContent = "";
      updateProgress();
      return;
    }
    renderWord(state.queue[0]);
    const currentWord = letters[state.queue[0]] ?? "";
    if (currentWord) {
      localStorage.setItem(`elifba.lastPrompt.${progressId}`, currentWord);
    }
    updateProgress();
  }

  function isLearningActive() {
    return activeIndices.length > 0 && !activeIndices.every((i) => state.stats[i]?.status === "gelernt");
  }

  function updateStatus(idx, answer) {
    const st = state.stats[idx];
    if (answer === "richtig") {
      if (st.status === "falsch") {
        st.status = "unsicher";
        st.correctCount = 0;
      } else if (st.status === "unsicher") {
        st.status = "richtig";
        st.correctCount = 1;
      } else if (st.status === "richtig") {
        st.correctCount += 1;
        if (st.correctCount >= REQUIRED_CORRECT) {
          st.status = "gelernt";
          learnedBaseline.add(idx);
        }
      } else if (st.status === "unbeantwortet") {
        st.status = "richtig";
        st.correctCount = 1;
      }
    } else if (answer === "unsicher") {
      st.status = "unsicher";
      st.correctCount = 0;
    } else if (answer === "falsch") {
      st.status = "falsch";
      st.correctCount = 0;
    }
    if (isRepeatMode && st.status === "gelernt") {
      repeatLearned.add(idx);
      persistRepeatLearned();
    }
  }

  function reposition(idx) {
    const pos = state.queue.indexOf(idx);
    if (pos > -1) state.queue.splice(pos, 1);

    const st = state.stats[idx].status;
    if (st === "gelernt") return;

    const insertAt = (position) => state.queue.splice(Math.min(position, state.queue.length), 0, idx);
    if (st === "falsch") insertAt(RED_POS);
    else if (st === "unsicher") insertAt(YELLOW_POS);
    else state.queue.push(idx);
  }

  function handleAnswer(answer) {
    if (!state.queue.length) return;
    const current = state.queue[0];
    hasAnsweredThisSession = true;
    updateStatus(current, answer);
    reposition(current);
    showCurrent();
  }

  function playAudio() {
    if (!state.queue.length || !audioBase) return;
    const audioIdx = state.queue[0] + 1;
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.currentTime = 0;
    }
    currentAudio = new Audio(`${audioBase}${audioIdx}.mp3`);
    currentAudio.play();
  }

  document.getElementById("btn-correct").addEventListener("click", () => handleAnswer("richtig"));
  document.getElementById("btn-unsure").addEventListener("click", () => handleAnswer("unsicher"));
  document.getElementById("btn-wrong").addEventListener("click", () => handleAnswer("falsch"));
  document.getElementById("btn-audio").addEventListener("click", playAudio);

  function shouldWarnOnLeave() {
    return !suppressLeavePrompt && isLearningActive();
  }

  function openLeavePrompt(options) {
    if (leavePromptOpen) return;
    leavePromptOpen = true;
    const modal = buildLeaveModal(options || {});
    modal.classList.add("visible");
  }

  function initBackGuard() {
    if (backGuardInitialized) return;
    if (!window.history || typeof window.history.pushState !== "function") return;
    backGuardInitialized = true;
    window.history.pushState({ elifbaTrainerGuard: true }, "", window.location.href);
  }

  function handleBackAttempt() {
    if (suppressLeavePrompt) return;
    if (!shouldWarnOnLeave()) {
      window.history.back();
      return;
    }

    openLeavePrompt({
      onStay() {
        window.history.pushState({ elifbaTrainerGuard: true }, "", window.location.href);
      },
      onLeave() {
        allowPageLeave();
        window.history.back();
      }
    });
  }

  window.addEventListener("beforeunload", (event) => {
    if (!shouldWarnOnLeave()) return;
    event.preventDefault();
    event.returnValue = "";
  });

  window.addEventListener("popstate", handleBackAttempt);

  document.addEventListener("click", (event) => {
    if (!shouldWarnOnLeave()) return;
    if (event.defaultPrevented) return;
    if (event.button !== 0) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

    const link = event.target.closest("a[href]");
    if (!link) return;
    if (link.target && link.target !== "_self") return;
    if (link.hasAttribute("download")) return;

    const href = link.getAttribute("href") || "";
    if (!href || href.startsWith("#") || href.startsWith("javascript:")) return;

    event.preventDefault();
    openLeavePrompt({
      leaveHref: link.href
    });
  });

  const helpBtn = document.getElementById("btn-help");
  if (helpBtn) {
    helpBtn.addEventListener("click", () => {
      if (!infoModalEl) infoModalEl = buildInfoModal();
      infoModalEl.classList.add("visible");
    });
  }

  const navEl = document.querySelector(".nav");
  if (navEl && !document.getElementById("btn-settings")) {
    const btnSettings = document.createElement("button");
    btnSettings.type = "button";
    btnSettings.id = "btn-settings";
    btnSettings.className = "nav-settings";
    btnSettings.textContent = "Einstellungen";
    navEl.appendChild(btnSettings);
  }

  const settingsBtn = document.getElementById("btn-settings");
  if (settingsBtn) {
    settingsBtn.addEventListener("click", () => {
      if (!settingsModalEl) settingsModalEl = buildSettingsModal();
      settingsModalEl.classList.add("visible");
    });
  }

  const resetBtn = document.getElementById("btn-reset");
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      if (!resetModalEl) resetModalEl = buildResetModal();
      resetModalEl.classList.add("visible");
    });
  }

  const hasSaved = loadProgress();
  if (!hasSaved) {
    initStats();
    activeIndices = getActiveIndices();
    batchIndices = [...activeIndices];
    resetBatchDisplayStats();
    initQueue();
  }
  initBackGuard();
  if (hideProgressBar && barEl) barEl.style.display = "none";
  showCurrent();
})();

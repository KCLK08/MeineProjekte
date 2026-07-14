<script>
  import { onDestroy, onMount, tick } from 'svelte';
  import {
    addExportRecord,
    createRun,
    createTemplate,
    deleteRunCascade,
    getDetectedFields,
    getRun,
    getSetupModel,
    getTemplate,
    listExports,
    listRuns,
    listTemplates,
    markTemplateReady,
    putTemplate,
    saveDetectedFields,
    saveSetupModel,
    updateRun
  } from '$lib/db';
  import {
    ETB_SETUP_VERSION,
    ETB_TEMPLATE_FILE_NAME,
    ETB_TEMPLATE_KIND,
    ETB_TEMPLATE_NAME,
    ETB_TEMPLATE_PUBLIC_URL,
    buildEtbSetupModel
  } from '$lib/etb-template';
  import { buildFinalPdfBytes } from '$lib/pdf-export';
  import { buildPhotoDocPdfBytes, compressPhotoDocImage, mergeBtbWithPhotoDoc } from '$lib/photo-doc';
  import { loadPdfPreviewDocument, renderFieldPreview, scanTemplatePdf } from '$lib/pdf-scan';
  import {
    buildRunSections,
    inputKeyForCell,
    inputKeyForField,
    requiredMissingCount,
    sectionProgressState,
    validateSetupModel
  } from '$lib/setup-model';
  import { normalizeClockTime } from '$lib/time-format';
  import { revivePhotoBlob } from '$lib/photo-storage';

  const MAX_PDF_SIZE = 40 * 1024 * 1024;
  const TABLE_ROW_COUNT_KEY_PREFIX = '__tableRows:';
  const MAIN_PERSONAL_TABLE_ID = 'table_main_personal';
  const MAIN_PERSONAL_TIME_COLUMN_IDS = new Set(['c2', 'c3']);
  const LEISTUNGSBLOCK_TABLE_ID = 'table_detail_blocks';
  const LEISTUNGSBLOCK_MULTI_ENTRY_COLUMN_IDS = new Set(['c4', 'c5']);
  const COMPACT_TEXT_FIELD_NAME_SET = new Set(['Text63', 'Text64', 'Text67', 'Text70']);
  const RUN_DEFAULTS_BY_FIELD_NAME = new Map([['Text2', 'Kazim Celik']]);
  const DATE_FIELD_NAME_PATTERN = /^Date\d+$/i;
  const GEWERK_FIELD_NAME_SET = new Set(['Text3', 'Text5', 'Text6', 'Text7', 'Text8']);
  const SHIFT_FIELD_NAME_SET = new Set(['Check Box1', 'Check Box2', 'Check Box3']);
  const SHIFT_FIELD_ORDER = new Map([
    ['Check Box1', 1],
    ['Check Box2', 2],
    ['Check Box3', 3]
  ]);
  const WEATHER_FIELD_NAMES = {
    dropdown: 'Dropdown6',
    tempMin: 'Text11',
    tempMax: 'Text12'
  };
  const WEATHER_CATEGORY_KEYWORDS = {
    clear: [
      ['klar', 'sonnig', 'sonne', 'heiter', 'clear', 'sunny']
    ],
    partly_cloudy: [
      ['teils bewolkt', 'teilweise bewolkt', 'leicht bewolkt', 'partly cloudy', 'wolkig'],
      ['bewolkt', 'heiter', 'klar']
    ],
    cloudy: [
      ['bedeckt', 'stark bewolkt', 'overcast', 'cloudy', 'bewolkt']
    ],
    fog: [
      ['nebel', 'fog', 'mist']
    ],
    rain: [
      ['regen', 'regnerisch', 'schauer', 'niesel', 'drizzle', 'rain']
    ],
    snow: [
      ['schnee', 'schneefall', 'graupel', 'snow', 'sleet']
    ],
    thunder: [
      ['gewitter', 'thunder', 'sturm']
    ]
  };
  const MIN_RUN_TEXTAREA_HEIGHT = 36;
  const MAX_RUN_TEXTAREA_HEIGHT = 168;
  const PHOTO_DOC_SECTION_ID = 'photo-doc';
  const PHOTO_DOC_ENABLED_RUN_KEY = '__photoDoc:enabled';
  const DAY_MS = 24 * 60 * 60 * 1000;
  const RUN_FINISH_EXPORT_MODE_BTB = 'btb_only';
  const RUN_FINISH_EXPORT_MODE_PHOTO = 'photo_doc_only';
  const RUN_FINISH_EXPORT_MODE_MERGED = 'btb_with_photo_doc';

  let view = 'home';
  let templates = [];
  let runs = [];
  let newRunNameInput = '';
  let homeSelectionMode = false;
  let selectedHomeRunIds = [];
  let homeRunWeekGroups = [];
  let homeExpandedWeekKeySet = new Set();
  let homeExpandedWeekKeys = [];
  let homeRunSelectionPulseIds = [];
  let homeRunSelectionPulseTimer = null;
  let homeRunDeleteBusy = false;
  let homeError = '';
  let homeInfo = '';
  let uploadBusy = false;
  let builtinTemplateId = '';

  let setupTemplate = null;
  let setupFields = [];
  let setupFieldById = new Map();
  let setupModelDraft = null;
  let setupError = '';
  let setupInfo = '';
  let setupSaving = false;
  let setupAutosaveTimer = null;
  let setupAutosaveBusy = false;
  let setupCanvas;
  let setupPreviewDoc = null;
  let setupPreviewTarget = { page: 1, rect: null };
  let setupFocusedFieldId = '';
  let setupFocusedFieldLabel = '';
  let setupPreviewToken = 0;
  let setupPreviewQueue = Promise.resolve();
  let setupMode = 'single';
  let setupActiveSingleSectionId = '';
  let setupActiveTableId = '';
  let setupSectionRenderNonce = 0;
  let setupDragFieldId = '';
  let setupDropFieldId = '';
  let setupDropPosition = 'before';
  let setupDragPointerId = null;

  let runTemplate = null;
  let runModel = null;
  let activeRun = null;
  let runValues = {};
  let activeSectionIndex = 0;
  let runError = '';
  let runInfo = '';
  let runAutosave = 'Bereit';
  let runSaving = false;
  let runExports = [];
  let runAutosaveTimer = null;
  let runSectionRenderNonce = 0;
  let runReviewExpanded = false;
  let runCanvas;
  let runPreviewDoc = null;
  let runPreviewPageCount = 1;
  let runPreviewDocBusy = false;
  let runPreviewDocToken = 0;
  let runPreviewTarget = { page: 1, rect: null };
  let runFocusedFieldId = '';
  let runPreviewToken = 0;
  let runPreviewQueue = Promise.resolve();
  let runFinishDialogOpen = false;
  let runFinishExportMode = RUN_FINISH_EXPORT_MODE_MERGED;
  let weatherSyncBusy = false;
  let runPhotoDoc = createEmptyRunPhotoDoc();
  let photoDocEditorOpen = false;
  let photoDocObjectUrls = new Map();
  let photoDocObjectUrlBlobs = new Map();

  function runSectionOrderRank(section) {
    const sectionId = String(section?.sectionId || '').trim();
    const label = String(section?.label || '').trim().toLowerCase();

    if (sectionId === 'single:header') return 10;
    if (sectionId === 'single:weather') return 20;
    if (sectionId === 'table:table_main_personal') return 30;
    if (sectionId === 'table:table_detail_blocks') return 40;
    if (sectionId === 'single:closing') return 50;
    if (sectionId === PHOTO_DOC_SECTION_ID) return 60;

    if (label.includes('kopfdaten')) return 10;
    if (label.includes('wetter')) return 20;
    if (label.includes('firmen') && label.includes('personal')) return 30;
    if (label.includes('leistungsblock') || label.includes('ausgeführte arbeiten') || label.includes('bauablauf'))
      return 40;
    if (label.includes('abschluss')) return 50;
    return 900;
  }

  function orderRunSections(sections = []) {
    return [...(sections || [])]
      .map((section, index) => ({
        section,
        index,
        rank: runSectionOrderRank(section)
      }))
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .map((entry) => entry.section);
  }

  $: setupValidationErrors = setupModelDraft ? validateSetupModel(setupModelDraft) : [];
  $: setupSingleSections = setupModelDraft?.single_sections || [];
  $: setupTableSections = setupModelDraft?.table_sections || [];
  $: activeSetupSingleSection =
    setupSingleSections.find((section) => String(section.sectionId) === String(setupActiveSingleSectionId)) ||
    setupSingleSections[0] ||
    null;
  $: activeSetupTableSection =
    setupTableSections.find((table) => String(table.tableId) === String(setupActiveTableId)) ||
    setupTableSections[0] ||
    null;
  $: setupPreviewMarkers = buildSetupPreviewMarkers();
  $: setupPreviewPageMarkers = setupPreviewMarkers.filter(
    (entry) => Number(entry.page || 1) === Number(setupPreviewTarget?.page || 1)
  );
  $: runSections = buildRunSectionsWithPhotoDoc(runModel);
  $: activeSection = runSections[activeSectionIndex] || null;
  $: activeTableVisibleRows = activeSection?.kind === 'table' ? visibleRowsForSection(activeSection, runValues) : [];
  $: activeTableVisibleCount = activeTableVisibleRows.length;
  $: activeTableRowLimit = activeSection?.kind === 'table' ? (activeSection.rows || []).length : 0;
  $: totalMissingRequired = runSections.reduce((sum, section) => sum + runSectionMissingCount(section, runValues), 0);
  $: doneSectionsCount = runSections.filter(
    (section) => runSectionProgress(section, runValues) === 'done'
  ).length;
  $: runCompletionPercent = runSections.length > 0 ? Math.round((doneSectionsCount / runSections.length) * 100) : 0;
  $: runPreviewMarkers = buildRunPreviewMarkers();
  $: if (runPreviewDoc) {
    runPreviewPageCount = Math.max(1, Number(runPreviewDoc?.numPages || 1));
  }
  $: if (view === 'run' && runPreviewDoc) {
    const current = Number(runPreviewTarget?.page || 1);
    const normalized = Math.max(1, Math.min(current, runPreviewPageCount));
    if (normalized !== current) {
      runPreviewTarget = {
        page: normalized,
        rect: null
      };
      runFocusedFieldId = '';
      renderRunPreview();
    }
  }
  $: syncPhotoDocObjectUrls(runPhotoDoc?.entries || []);
  $: selectedHomeRunCount = selectedHomeRunIds.length;
  $: selectableHomeRunIds = runs.map((run) => String(run?.runId || '').trim()).filter(Boolean);
  $: selectedHomeRunIdSet = new Set(selectedHomeRunIds.map((runId) => String(runId || '').trim()).filter(Boolean));
  $: homeRunWeekGroups = buildHomeRunWeekGroups(runs);
  $: homeExpandedWeekKeySet = new Set(
    homeExpandedWeekKeys.map((key) => String(key || '').trim()).filter(Boolean)
  );
  $: homeRunSelectionPulseIdSet = new Set(homeRunSelectionPulseIds.map((runId) => String(runId || '').trim()).filter(Boolean));
  $: allHomeRunsSelected = selectableHomeRunIds.length > 0 && selectedHomeRunCount >= selectableHomeRunIds.length;
  $: {
    const allowedWeekKeys = new Set(homeRunWeekGroups.map((group) => String(group?.weekKey || '').trim()).filter(Boolean));
    const filteredWeekKeys = homeExpandedWeekKeys.filter((key) => allowedWeekKeys.has(String(key || '').trim()));
    if (
      filteredWeekKeys.length !== homeExpandedWeekKeys.length ||
      filteredWeekKeys.some((key, index) => key !== homeExpandedWeekKeys[index])
    ) {
      homeExpandedWeekKeys = filteredWeekKeys;
    }
  }
  $: {
    const normalizedFinishMode = normalizeRunFinishExportMode(runFinishExportMode);
    if (normalizedFinishMode !== runFinishExportMode) {
      runFinishExportMode = normalizedFinishMode;
    }
  }

  $: if (view === 'setup' && setupSingleSections.length > 0) {
    if (!setupSingleSections.some((section) => String(section.sectionId) === String(setupActiveSingleSectionId))) {
      setupActiveSingleSectionId = String(setupSingleSections[0].sectionId);
    }
  }

  $: if (view === 'setup' && setupTableSections.length > 0) {
    if (!setupTableSections.some((table) => String(table.tableId) === String(setupActiveTableId))) {
      setupActiveTableId = String(setupTableSections[0].tableId);
    }
  }

  $: if (view === 'setup' && setupMode === 'single' && setupSingleSections.length === 0 && setupTableSections.length > 0) {
    setupMode = 'table';
  }

  $: if (view === 'setup' && setupMode === 'table' && setupTableSections.length === 0 && setupSingleSections.length > 0) {
    setupMode = 'single';
  }

  function flushRunAutosaveOnPageExit() {
    if (view !== 'run' || !activeRun) return;
    if (runAutosaveTimer) {
      clearTimeout(runAutosaveTimer);
      runAutosaveTimer = null;
    }
    void persistRunAutosave();
  }

  function handleRunAutosaveVisibilityChange() {
    if (typeof document === 'undefined' || document.visibilityState !== 'hidden') return;
    flushRunAutosaveOnPageExit();
  }

  onMount(() => {
    initializeBuiltinTemplate();
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', flushRunAutosaveOnPageExit);
      window.addEventListener('beforeunload', flushRunAutosaveOnPageExit);
      document.addEventListener('visibilitychange', handleRunAutosaveVisibilityChange);
    }
  });

  onDestroy(() => {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pagehide', flushRunAutosaveOnPageExit);
      window.removeEventListener('beforeunload', flushRunAutosaveOnPageExit);
      document.removeEventListener('visibilitychange', handleRunAutosaveVisibilityChange);
    }
    flushRunAutosaveOnPageExit();
    if (setupAutosaveTimer) {
      clearTimeout(setupAutosaveTimer);
      setupAutosaveTimer = null;
    }
    if (homeRunSelectionPulseTimer) {
      clearTimeout(homeRunSelectionPulseTimer);
      homeRunSelectionPulseTimer = null;
    }
    clearPhotoDocObjectUrls();
    detachSetupFieldDragListeners();
  });

  function nowLabel() {
    const date = new Date();
    return date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
  }

  function normalizeRunNameInput(value) {
    return String(value || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildRunTitleByConvention(nameInput) {
    const dateToken = new Date().toISOString().slice(0, 10);
    const normalizedName = normalizeRunNameInput(nameInput);
    if (!normalizedName) return `BTB ${dateToken}`;
    return `BTB ${dateToken} - ${normalizedName}`;
  }

  function hasRunValue(type, value) {
    if (type === 'checkbox') return value === true;
    return String(value ?? '').trim().length > 0;
  }

  function createEmptyRunPhotoDoc() {
    return {
      enabled: null,
      entries: [],
      updatedAt: ''
    };
  }

  function normalizeRunPhotoDocEnabled(value) {
    if (value === true || value === false) return value;
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    if (normalized === 'yes' || normalized === 'ja' || normalized === 'true') return true;
    if (normalized === 'no' || normalized === 'nein' || normalized === 'false') return false;
    return null;
  }

  function normalizeRunPhotoDocEntry(entry, index = 0) {
    const photoBlob = revivePhotoBlob(entry?.photoBlob, String(entry?.mimeType || 'image/jpeg'));
    if (!(photoBlob instanceof Blob)) return null;
    const createdAt = String(entry?.createdAt || '').trim() || new Date().toISOString();
    const id = String(entry?.id || '').trim() || `photo_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
    return {
      id,
      createdAt,
      mimeType: String(photoBlob.type || entry?.mimeType || 'image/jpeg').trim() || 'image/jpeg',
      photoBlob
    };
  }

  function normalizeRunPhotoDoc(value) {
    const enabled = normalizeRunPhotoDocEnabled(value?.enabled);
    const rawEntries = Array.isArray(value?.entries) ? value.entries : [];
    return {
      enabled,
      entries: rawEntries.map((entry, index) => normalizeRunPhotoDocEntry(entry, index)).filter(Boolean),
      updatedAt: String(value?.updatedAt || '').trim()
    };
  }

  function cloneRunPhotoDoc(value = runPhotoDoc) {
    return normalizeRunPhotoDoc(value);
  }

  function runValuesWithPhotoDocChoice(values = {}, enabled = null) {
    const next = { ...(values || {}) };
    if (enabled === true) {
      next[PHOTO_DOC_ENABLED_RUN_KEY] = 'yes';
    } else if (enabled === false) {
      next[PHOTO_DOC_ENABLED_RUN_KEY] = 'no';
    } else {
      delete next[PHOTO_DOC_ENABLED_RUN_KEY];
    }
    return next;
  }

  function isPhotoDocSection(section) {
    if (!section) return false;
    return String(section?.kind || '').trim() === 'photo-doc' || String(section?.sectionId || '').trim() === PHOTO_DOC_SECTION_ID;
  }

  function isPhotoDocEnabled(value = runPhotoDoc) {
    return value?.enabled === true;
  }

  function hasPhotoDocEntries(value = runPhotoDoc) {
    return Array.isArray(value?.entries) && value.entries.length > 0;
  }

  function photoDocExportEntries(value = runPhotoDoc) {
    if (!hasPhotoDocEntries(value)) return [];
    return value.entries.filter((entry) => entry?.photoBlob instanceof Blob);
  }

  function normalizeRunFinishExportMode(mode) {
    const normalizedMode = String(mode || '').trim();
    if (normalizedMode === RUN_FINISH_EXPORT_MODE_BTB) return RUN_FINISH_EXPORT_MODE_BTB;
    if (normalizedMode === RUN_FINISH_EXPORT_MODE_PHOTO) return RUN_FINISH_EXPORT_MODE_PHOTO;
    return RUN_FINISH_EXPORT_MODE_MERGED;
  }

  function isPhotoDocRequiredMissing(value = runPhotoDoc) {
    return value?.enabled !== true && value?.enabled !== false;
  }

  function photoDocChoiceValue(value = runPhotoDoc) {
    if (value?.enabled === true) return 'yes';
    if (value?.enabled === false) return 'no';
    return '';
  }

  function makePhotoDocSection() {
    return {
      sectionId: PHOTO_DOC_SECTION_ID,
      kind: 'photo-doc',
      label: 'Fotodokumentation',
      page: Number(runTemplate?.pageCount || runModel?.pageCount || 1)
    };
  }

  function buildRunSectionsWithPhotoDoc(model) {
    if (!model) return [];
    const ordered = orderRunSections(buildRunSections(model));
    return [...ordered, makePhotoDocSection()];
  }

  function photoDocEntryObjectUrl(entry) {
    const id = String(entry?.id || '').trim();
    if (!id) return '';
    return String(photoDocObjectUrls.get(id) || '');
  }

  function syncPhotoDocObjectUrls(entries = []) {
    if (typeof URL === 'undefined') return;
    const ids = new Set((entries || []).map((entry) => String(entry?.id || '').trim()).filter(Boolean));

    for (const [entryId, objectUrl] of photoDocObjectUrls.entries()) {
      if (ids.has(entryId)) continue;
      URL.revokeObjectURL(objectUrl);
      photoDocObjectUrls.delete(entryId);
      photoDocObjectUrlBlobs.delete(entryId);
    }

    for (const entry of entries || []) {
      const entryId = String(entry?.id || '').trim();
      if (!entryId) continue;
      const photoBlob = revivePhotoBlob(entry?.photoBlob);
      if (!(photoBlob instanceof Blob)) continue;
      const previousBlob = photoDocObjectUrlBlobs.get(entryId);
      if (previousBlob === photoBlob && photoDocObjectUrls.has(entryId)) continue;

      const previousUrl = photoDocObjectUrls.get(entryId);
      if (previousUrl) {
        URL.revokeObjectURL(previousUrl);
      }
      photoDocObjectUrls.set(entryId, URL.createObjectURL(photoBlob));
      photoDocObjectUrlBlobs.set(entryId, photoBlob);
    }
  }

  function clearPhotoDocObjectUrls() {
    if (typeof URL === 'undefined') return;
    for (const objectUrl of photoDocObjectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
    photoDocObjectUrls = new Map();
    photoDocObjectUrlBlobs = new Map();
  }

  function photoDocSectionMissingCount() {
    return isPhotoDocRequiredMissing() ? 1 : 0;
  }

  function runSectionMissingCount(section, values = runValues) {
    if (isPhotoDocSection(section)) return photoDocSectionMissingCount();
    return requiredMissingCount(section, values, sectionRunOptions(section, values));
  }

  function runSectionProgress(section, values = runValues) {
    if (isPhotoDocSection(section)) {
      return isPhotoDocRequiredMissing() ? 'progress' : 'done';
    }
    return sectionProgressState(section, values, sectionRunOptions(section, values));
  }

  async function refreshRunPreviewDocument() {
    if (!runTemplate?.pdfBlob) return;
    runPreviewDocBusy = true;
    const token = ++runPreviewDocToken;
    const currentPage = Number(runPreviewTarget?.page || 1);

    try {
      const baseBytes = new Uint8Array(await runTemplate.pdfBlob.arrayBuffer());
      const merged = await mergeBtbWithPhotoDoc({
        btbPdfBytes: baseBytes,
        photoDocEnabled: isPhotoDocEnabled(),
        photoEntries: runPhotoDoc.entries
      });
      const previewBlob = new Blob([merged.bytes], { type: 'application/pdf' });

      const doc = await loadPdfPreviewDocument(previewBlob);
      if (token !== runPreviewDocToken) return;
      runPreviewDoc = doc;
      runPreviewPageCount = Math.max(1, Number(doc?.numPages || 1));

      const normalizedPage = Math.max(1, Math.min(currentPage, runPreviewPageCount));
      if (normalizedPage !== Number(runPreviewTarget?.page || 1)) {
        runPreviewTarget = { page: normalizedPage, rect: null };
        runFocusedFieldId = '';
      }

      await renderRunPreview();
    } catch (error) {
      if (token !== runPreviewDocToken) return;
      runError = error?.message || 'Run-Vorschau konnte nicht geladen werden.';
    } finally {
      if (token === runPreviewDocToken) {
        runPreviewDocBusy = false;
      }
    }
  }

  function setRunPreviewPage(page) {
    const max = Math.max(1, Number(runPreviewPageCount || 1));
    const next = Math.max(1, Math.min(Number(page || 1), max));
    if (next === Number(runPreviewTarget?.page || 1)) return;
    runPreviewTarget = {
      page: next,
      rect: null
    };
    runFocusedFieldId = '';
    renderRunPreview();
  }

  function moveRunPreviewPage(delta) {
    const current = Number(runPreviewTarget?.page || 1);
    setRunPreviewPage(current + Number(delta || 0));
  }

  function updateRunPhotoDoc(nextPhotoDoc, { refreshPreview = false, persistImmediately = false } = {}) {
    const normalized = normalizeRunPhotoDoc(nextPhotoDoc);
    normalized.updatedAt = new Date().toISOString();
    runPhotoDoc = normalized;
    runValues = runValuesWithPhotoDocChoice(runValues, normalized.enabled);
    runSectionRenderNonce += 1;
    void syncRunSectionInputs();
    if (persistImmediately) {
      void persistRunAutosave();
    } else {
      scheduleRunAutosave();
    }
    if (refreshPreview) {
      void refreshRunPreviewDocument();
    }
  }

  function setRunPhotoDocChoice(choice) {
    const enabled = normalizeRunPhotoDocEnabled(choice);
    if (enabled === runPhotoDoc?.enabled) return;
    if (enabled !== true) {
      photoDocEditorOpen = false;
    }
    updateRunPhotoDoc(
      {
        ...runPhotoDoc,
        enabled
      },
      { refreshPreview: true }
    );
    if (enabled === true) {
      runInfo = 'Fotodokumentation aktiviert.';
    } else if (enabled === false) {
      runInfo = 'Fotodokumentation deaktiviert (Bilder bleiben erhalten).';
    }
    runError = '';
  }

  async function addPhotoDocEntryFromFile(file) {
    if (!(file instanceof Blob)) return;
    if (!String(file.type || '').toLowerCase().startsWith('image/')) {
      runError = 'Bitte eine Bilddatei auswählen.';
      return;
    }

    runError = '';
    runInfo = '';
    try {
      const compressed = await compressPhotoDocImage(file, {
        maxWidthOrHeight: 1900,
        quality: 0.78
      });
      const entry = normalizeRunPhotoDocEntry(
        {
          id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          createdAt: new Date().toISOString(),
          photoBlob: compressed instanceof Blob ? compressed : file
        },
        0
      );
      if (!entry) {
        runError = 'Bild konnte nicht hinzugefügt werden.';
        return;
      }

      updateRunPhotoDoc(
        {
          ...runPhotoDoc,
          entries: [...(runPhotoDoc.entries || []), entry]
        },
        { refreshPreview: true, persistImmediately: true }
      );
      runInfo = 'Bild zur Fotodoku hinzugefügt.';
    } catch (error) {
      runError = error?.message || 'Bild konnte nicht verarbeitet werden.';
    }
  }

  async function handlePhotoDocAddInput(event) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0] || null;
    input.value = '';
    if (!file) return;
    await addPhotoDocEntryFromFile(file);
  }

  async function handlePhotoDocReplaceInput(event, entryId) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement)) return;
    const file = input.files?.[0] || null;
    input.value = '';
    if (!file) return;

    const normalizedId = String(entryId || '').trim();
    if (!normalizedId) return;
    try {
      const compressed = await compressPhotoDocImage(file, {
        maxWidthOrHeight: 1900,
        quality: 0.78
      });
      const nextEntries = (runPhotoDoc.entries || []).map((entry) => {
        const currentId = String(entry?.id || '').trim();
        if (currentId !== normalizedId) return entry;
        return {
          ...entry,
          photoBlob: compressed instanceof Blob ? compressed : file,
          createdAt: new Date().toISOString()
        };
      });
      updateRunPhotoDoc(
        {
          ...runPhotoDoc,
          entries: nextEntries
        },
        { refreshPreview: true, persistImmediately: true }
      );
      runInfo = 'Bild aktualisiert.';
      runError = '';
    } catch (error) {
      runError = error?.message || 'Bild konnte nicht ersetzt werden.';
    }
  }

  function deletePhotoDocEntry(entryId) {
    const normalizedId = String(entryId || '').trim();
    if (!normalizedId) return;
    const nextEntries = (runPhotoDoc.entries || []).filter((entry) => String(entry?.id || '').trim() !== normalizedId);
    if (nextEntries.length === (runPhotoDoc.entries || []).length) return;
    updateRunPhotoDoc(
      {
        ...runPhotoDoc,
        entries: nextEntries
      },
      { refreshPreview: true, persistImmediately: true }
    );
    runInfo = 'Bild aus Fotodoku entfernt.';
    runError = '';
  }

  async function savePhotoDocEditor() {
    await flushRunAutosave();
    runInfo = 'Fotodokumentation gespeichert.';
    runError = '';
  }

  function todayDateLabel() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = String(now.getFullYear());
    return `${day}.${month}.${year}`;
  }

  function runDefaultValueForField(field) {
    const fieldName = String(field?.fieldName || '').trim();
    if (!fieldName) return '';
    if (RUN_DEFAULTS_BY_FIELD_NAME.has(fieldName)) {
      return String(RUN_DEFAULTS_BY_FIELD_NAME.get(fieldName) || '');
    }
    if (DATE_FIELD_NAME_PATTERN.test(fieldName)) {
      return todayDateLabel();
    }
    return '';
  }

  function isGewerkField(field) {
    return GEWERK_FIELD_NAME_SET.has(String(field?.fieldName || '').trim());
  }

  function isShiftField(field) {
    return SHIFT_FIELD_NAME_SET.has(String(field?.fieldName || '').trim());
  }

  function shiftFieldsInSection(section) {
    if (!section || section.kind !== 'single') return [];
    return [...(section.fields || []).filter((field) => isShiftField(field))].sort((a, b) => {
      const rankA = Number(SHIFT_FIELD_ORDER.get(String(a?.fieldName || '').trim()) || 999);
      const rankB = Number(SHIFT_FIELD_ORDER.get(String(b?.fieldName || '').trim()) || 999);
      return rankA - rankB;
    });
  }

  function gewerkFieldsInSection(section) {
    if (!section || section.kind !== 'single') return [];
    return (section.fields || []).filter((field) => isGewerkField(field));
  }

  function isGewerkGroupSection(section) {
    if (!section || section.kind !== 'single') return false;
    const sectionId = String(section.sectionId || '').toLowerCase();
    const label = String(section.label || '').toLowerCase();
    return sectionId.includes('header') || label.includes('kopfdaten');
  }

  function isHeaderSingleSection(section) {
    return isGewerkGroupSection(section);
  }

  function headerFieldDisplayOrder(field) {
    const fieldName = fieldNameOf(field);
    if (fieldName === 'Text1') return 10; // Projekt
    if (fieldName === 'Date1') return 20; // Datum
    if (fieldName === 'Text2') return 40; // Bearbeiter
    return 90;
  }

  function displaySingleSectionLabel(section) {
    const sectionId = String(section?.sectionId || '').trim().toLowerCase();
    if (sectionId === 'weather' || sectionId.endsWith(':weather')) return 'Witterung';
    return String(section?.label || '').trim() || 'Gruppe';
  }

  function displayTableSectionLabel(table) {
    const tableId = String(table?.tableId || '').trim().toLowerCase();
    if (tableId === MAIN_PERSONAL_TABLE_ID) return 'Baustelenbesetzung';
    return String(table?.label || '').trim() || 'Tabelle';
  }

  function displayRunSectionLabel(section) {
    if (!section) return '';
    if (section.kind === 'single') return displaySingleSectionLabel(section);
    if (section.kind === 'table') return displayTableSectionLabel(section);
    return String(section?.label || '').trim();
  }

  function displayTableColumnLabel(section, column) {
    const raw = String(column?.label || column?.columnId || '').trim();
    if (!raw) return '';
    if (isLeistungsblockTable(section) && tableColumnId(column, null) === 'c4') {
      return raw.replace(/\s+b\)\s+/i, '\nb) ');
    }
    return raw;
  }

  function selectedGewerkFieldName(section, values = runValues) {
    const fields = gewerkFieldsInSection(section);
    for (const field of fields) {
      const key = inputKeyForField(field);
      if (!key) continue;
      if (hasRunValue(field.type, values[key])) return String(field.fieldName || '');
    }
    return '';
  }

  function firstGewerkField(section) {
    return gewerkFieldsInSection(section)[0] || null;
  }

  function gewerkSelectionInputKey(section) {
    const first = firstGewerkField(section);
    if (!first) return '';
    return inputKeyForField(first);
  }

  function setGewerkSelection(section, selectedFieldName) {
    const fields = gewerkFieldsInSection(section);
    if (fields.length === 0) return;
    const selectedName = String(selectedFieldName || '').trim();
    const nextValues = { ...runValues };
    let changed = false;

    for (const field of fields) {
      const key = inputKeyForField(field);
      if (!key) continue;
      const nextValue = selectedName && String(field.fieldName || '') === selectedName ? 'X' : '';
      if (String(nextValues[key] ?? '') === nextValue) continue;
      nextValues[key] = nextValue;
      changed = true;
    }

    if (!changed) return;
    runValues = nextValues;
    renderRunPreview();
    scheduleRunAutosave();
  }

  function setShiftSelection(section, selectedField, checked) {
    const fields = shiftFieldsInSection(section);
    if (fields.length === 0 || !selectedField) return;

    const selectedFieldId = String(selectedField?.fieldId || '').trim();
    if (!selectedFieldId) return;

    const nextValues = { ...runValues };
    let changed = false;

    for (const field of fields) {
      const key = inputKeyForField(field);
      if (!key) continue;

      const fieldId = String(field?.fieldId || '').trim();
      let nextValue = nextValues[key] === true;
      if (checked === true) {
        nextValue = fieldId === selectedFieldId;
      } else if (fieldId === selectedFieldId) {
        nextValue = false;
      }

      if (nextValues[key] === nextValue) continue;
      nextValues[key] = nextValue;
      changed = true;
    }

    if (!changed) return;
    runValues = nextValues;
    renderRunPreview();
    scheduleRunAutosave();
  }

  function applyRunDefaultsFromModel(model, values = {}) {
    const nextValues = { ...(values || {}) };
    let changed = false;

    for (const section of model?.single_sections || []) {
      for (const field of section?.fields || []) {
        if (field?.skipped === true) continue;
        const defaultValue = runDefaultValueForField(field);
        if (typeof defaultValue !== 'string') continue;
        if (!defaultValue) continue;
        const key = inputKeyForField(field);
        if (!key) continue;
        if (hasRunValue(field.type, nextValues[key])) continue;
        nextValues[key] = defaultValue;
        changed = true;
      }
    }

    return { values: nextValues, changed };
  }

  function tableRowCountKey(tableId) {
    return `${TABLE_ROW_COUNT_KEY_PREFIX}${String(tableId || '').trim()}`;
  }

  function isLeistungsblockTable(section) {
    if (!section || section.kind !== 'table') return false;
    const tableId = String(section.tableId || '').trim();
    if (tableId === LEISTUNGSBLOCK_TABLE_ID) return true;
    return String(section.label || '').toLowerCase().includes('leistungsblock');
  }

  function isMainPersonalTable(section) {
    if (!section || section.kind !== 'table') return false;
    const tableId = String(section.tableId || '').trim();
    if (tableId === MAIN_PERSONAL_TABLE_ID) return true;
    const label = String(section.label || '').toLowerCase();
    return label.includes('firmen') && label.includes('personal');
  }

  function isMainPersonalTimeCell(section, column, cell) {
    if (!isMainPersonalTable(section)) return false;
    const columnId = String(column?.columnId || cell?.columnId || '').trim();
    return MAIN_PERSONAL_TIME_COLUMN_IDS.has(columnId);
  }

  function finalizeRunTableTextInput(section, column, cell, key, rawValue) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    if (!isMainPersonalTimeCell(section, column, cell)) return;

    const currentValue = String(rawValue ?? '');
    const normalizedValue = normalizeClockTime(currentValue);
    if (normalizedValue === currentValue) return;
    setRunValue(normalizedKey, normalizedValue);
  }

  function fieldNameOf(fieldLike) {
    return String(fieldLike?.fieldName || '').trim();
  }

  function isCompactTextField(fieldLike) {
    return COMPACT_TEXT_FIELD_NAME_SET.has(fieldNameOf(fieldLike));
  }

  function isRunCellMultiline(section, column, cell) {
    if (!cell || String(cell.type || '').toLowerCase() !== 'text') return false;
    if (!isLeistungsblockTable(section)) return false;
    const columnId = String(column?.columnId || cell?.columnId || '').trim();
    return LEISTUNGSBLOCK_MULTI_ENTRY_COLUMN_IDS.has(columnId);
  }

  function tableColumnId(column, cell) {
    return String(column?.columnId || cell?.columnId || '').trim();
  }

  function isLeistungsblockPrimaryTextColumn(section, column, cell) {
    return isLeistungsblockTable(section) && tableColumnId(column, cell) === 'c4';
  }

  function isLeistungsblockSecondaryTextColumn(section, column, cell) {
    return isLeistungsblockTable(section) && tableColumnId(column, cell) === 'c5';
  }

  function isLeistungsblockCompactColumn(section, column, cell) {
    if (!isLeistungsblockTable(section)) return false;
    const columnId = tableColumnId(column, cell);
    return columnId === 'c1' || columnId === 'c2' || columnId === 'c3';
  }

  function isMainPersonalCompanyColumn(section, column, cell) {
    return isMainPersonalTable(section) && tableColumnId(column, cell) === 'c1';
  }

  function isMainPersonalStartEndColumn(section, column, cell) {
    if (!isMainPersonalTable(section)) return false;
    const columnId = tableColumnId(column, cell);
    return columnId === 'c2' || columnId === 'c3';
  }

  function normalizeSearchText(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function weatherCategoryFromCode(code) {
    const value = Number(code);
    if (!Number.isFinite(value)) return 'cloudy';
    if (value >= 95) return 'thunder';
    if ((value >= 71 && value <= 77) || value === 85 || value === 86) return 'snow';
    if ((value >= 51 && value <= 67) || (value >= 80 && value <= 82)) return 'rain';
    if (value === 45 || value === 48) return 'fog';
    if (value === 0) return 'clear';
    if (value === 1 || value === 2) return 'partly_cloudy';
    return 'cloudy';
  }

  function pickWeatherDropdownOption(options = [], weatherCode) {
    const normalizedOptions = (options || [])
      .map((option) => ({
        raw: String(option || '').trim(),
        normalized: normalizeSearchText(option)
      }))
      .filter((entry) => entry.raw.length > 0 && entry.normalized.length > 0);
    if (normalizedOptions.length === 0) return '';

    const category = weatherCategoryFromCode(weatherCode);
    const keywordGroups = WEATHER_CATEGORY_KEYWORDS[category] || [];

    for (const keywords of keywordGroups) {
      let best = null;
      for (const option of normalizedOptions) {
        let score = 0;
        for (const keyword of keywords) {
          const normalizedKeyword = normalizeSearchText(keyword);
          if (!normalizedKeyword) continue;
          if (!option.normalized.includes(normalizedKeyword)) continue;
          score = Math.max(score, normalizedKeyword.length);
        }
        if (score === 0) continue;
        if (!best || score > best.score) {
          best = { option: option.raw, score };
        }
      }
      if (best?.option) return best.option;
    }

    return '';
  }

  function formatTemperatureValue(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '';
    return String(Math.round(number));
  }

  function isWeatherSingleSection(section) {
    if (!section || section.kind !== 'single') return false;
    const fieldNames = new Set((section.fields || []).map((field) => String(field?.fieldName || '').trim()));
    if (fieldNames.has(WEATHER_FIELD_NAMES.dropdown) || fieldNames.has(WEATHER_FIELD_NAMES.tempMin) || fieldNames.has(WEATHER_FIELD_NAMES.tempMax)) {
      return true;
    }
    const label = String(section.label || '').toLowerCase();
    return label.includes('wetter');
  }

  function fieldByNameInSection(section, fieldName) {
    return (section?.fields || []).find((field) => String(field?.fieldName || '').trim() === String(fieldName || '').trim()) || null;
  }

  function applyRunValuePatch(patch = {}) {
    const entries = Object.entries(patch || {}).filter(([key]) => String(key || '').trim());
    if (entries.length === 0) return false;

    let changed = false;
    const nextValues = { ...runValues };
    for (const [key, value] of entries) {
      if (String(nextValues[key] ?? '') === String(value ?? '')) continue;
      nextValues[key] = value;
      changed = true;
    }

    if (!changed) return false;
    runValues = nextValues;
    void syncRunSectionInputs();
    renderRunPreview();
    scheduleRunAutosave();
    return true;
  }

  function getCurrentPosition() {
    return new Promise((resolve, reject) => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        reject(new Error('Geolocation ist in diesem Browser nicht verfügbar.'));
        return;
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 12000,
        maximumAge: 15 * 60 * 1000
      });
    });
  }

  async function fetchCurrentWeatherForCoordinates(latitude, longitude) {
    const lat = Number(latitude);
    const lon = Number(longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new Error('Ungültige Standortdaten.');
    }

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lon));
    url.searchParams.set('current', 'weather_code,temperature_2m');
    url.searchParams.set('daily', 'weather_code,temperature_2m_min,temperature_2m_max');
    url.searchParams.set('forecast_days', '1');
    url.searchParams.set('timezone', 'auto');

    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error('Wetterdaten konnten nicht geladen werden.');
    }
    const data = await response.json();
    const daily = data?.daily || {};
    const current = data?.current || data?.current_weather || {};

    const currentCode = Number(current.weather_code ?? current.weathercode);
    const dailyCode = Number((daily.weather_code || daily.weathercode || [])[0]);
    const weatherCode = Number.isFinite(currentCode) ? currentCode : dailyCode;
    const tempMin = Number((daily.temperature_2m_min || [])[0]);
    const tempMax = Number((daily.temperature_2m_max || [])[0]);

    return {
      weatherCode,
      tempMin,
      tempMax
    };
  }

  async function refreshWeatherValues(section = activeSection) {
    if (!section || section.kind !== 'single' || weatherSyncBusy) return;
    const dropdownField = fieldByNameInSection(section, WEATHER_FIELD_NAMES.dropdown);
    const tempMinField = fieldByNameInSection(section, WEATHER_FIELD_NAMES.tempMin);
    const tempMaxField = fieldByNameInSection(section, WEATHER_FIELD_NAMES.tempMax);
    if (!dropdownField && !tempMinField && !tempMaxField) return;

    weatherSyncBusy = true;
    runError = '';
    runInfo = '';
    try {
      const position = await getCurrentPosition();
      const latitude = Number(position?.coords?.latitude);
      const longitude = Number(position?.coords?.longitude);
      const weather = await fetchCurrentWeatherForCoordinates(latitude, longitude);

      const patch = {};
      if (tempMinField) {
        patch[inputKeyForField(tempMinField)] = formatTemperatureValue(weather.tempMin);
      }
      if (tempMaxField) {
        patch[inputKeyForField(tempMaxField)] = formatTemperatureValue(weather.tempMax);
      }
      if (dropdownField) {
        const selectedOption = pickWeatherDropdownOption(dropdownField.options || [], weather.weatherCode);
        if (selectedOption) {
          patch[inputKeyForField(dropdownField)] = selectedOption;
        }
      }

      const updated = applyRunValuePatch(patch);
      if (updated) {
        runInfo = 'Wetterwerte aktualisiert.';
      } else {
        runInfo = 'Keine Wetterwerte geändert.';
      }
    } catch (error) {
      if (Number(error?.code) === 1) {
        runError = 'Standortzugriff abgelehnt. Bitte Geolocation erlauben und erneut versuchen.';
      } else {
        runError = error?.message || 'Wetterwerte konnten nicht aktualisiert werden.';
      }
    } finally {
      weatherSyncBusy = false;
    }
  }

  function runTextareaFontSize(value, fieldLike = null) {
    const text = String(value ?? '');
    const lineCount = text.split(/\r?\n/).length;
    const length = text.length;
    const compact = isCompactTextField(fieldLike);

    if (compact) {
      if (lineCount >= 6 || length > 320) return 10;
      if (lineCount >= 4 || length > 210) return 10;
      if (lineCount >= 2 || length > 110) return 11;
      return 12;
    }

    if (lineCount >= 6 || length > 320) return 12;
    if (lineCount >= 4 || length > 210) return 13;
    if (lineCount >= 2 || length > 110) return 14;
    return 15;
  }

  function resizeRunTextarea(node) {
    if (!(node instanceof HTMLTextAreaElement)) return;
    node.style.height = 'auto';
    const targetHeight = Math.max(MIN_RUN_TEXTAREA_HEIGHT, Math.min(MAX_RUN_TEXTAREA_HEIGHT, node.scrollHeight || MIN_RUN_TEXTAREA_HEIGHT));
    node.style.height = `${targetHeight}px`;
  }

  function handleRunTextareaInput(key, node) {
    if (!(node instanceof HTMLTextAreaElement)) return;
    resizeRunTextarea(node);
    setRunValue(key, node.value);
  }

  function runCellHasValue(cell, values = {}) {
    if (!cell) return false;
    const key = inputKeyForCell(cell);
    const value = values[key];
    if (cell.type === 'checkbox') return value === true;
    return String(value ?? '').trim().length > 0;
  }

  function detectedVisibleRowCountFromValues(section, values = {}) {
    if (!section || section.kind !== 'table') return 0;
    let lastFilled = 0;
    for (let index = 0; index < (section.rows || []).length; index += 1) {
      const row = section.rows[index];
      const rowHasValue = (row.cells || []).some((cell) => runCellHasValue(cell, values));
      if (rowHasValue) lastFilled = index + 1;
    }
    return lastFilled;
  }

  function visibleRowCountForSection(section, values = {}) {
    if (!section || section.kind !== 'table') return 0;
    const rows = Array.isArray(section.rows) ? section.rows : [];
    if (rows.length === 0) return 0;

    const maxRows = rows.length;
    const storedCount = Number(values[tableRowCountKey(section.tableId)]);
    const detectedCount = detectedVisibleRowCountFromValues(section, values);
    const minimum = Math.max(1, detectedCount);

    if (!Number.isFinite(storedCount)) return Math.min(maxRows, minimum);
    return Math.min(maxRows, Math.max(minimum, Math.floor(storedCount)));
  }

  function visibleRowsForSection(section, values = {}) {
    if (!section || section.kind !== 'table') return [];
    const count = visibleRowCountForSection(section, values);
    return (section.rows || []).slice(0, count);
  }

  function requiredAnyGroupsForSection(section) {
    if (!section || section.kind !== 'single') return [];
    if (!isGewerkGroupSection(section)) return [];
    const groups = [];

    const gewerkGroupFields = gewerkFieldsInSection(section).filter((field) => String(field?.fieldId || '').trim());
    if (gewerkGroupFields.length > 0) {
      groups.push({
        groupId: `gewerk:${String(section.sectionId || 'single')}`,
        label: 'Gewerk',
        fieldIds: gewerkGroupFields.map((field) => String(field.fieldId || '').trim()).filter(Boolean)
      });
    }

    const shiftGroupFields = shiftFieldsInSection(section).filter((field) => String(field?.fieldId || '').trim());
    if (shiftGroupFields.length > 0) {
      groups.push({
        groupId: `shift:${String(section.sectionId || 'single')}`,
        label: 'Schicht',
        fieldIds: shiftGroupFields.map((field) => String(field.fieldId || '').trim()).filter(Boolean)
      });
    }

    return groups;
  }

  function missingRequiredAnyGroups(section, values = {}, options = sectionRunOptions(section, values)) {
    const groups = Array.isArray(options?.requiredAnyGroups) ? options.requiredAnyGroups : [];
    if (!section || section.kind !== 'single' || groups.length === 0) return [];

    const fieldById = new Map(
      (section.fields || []).map((field) => [String(field?.fieldId || '').trim(), field]).filter(([id]) => !!id)
    );

    const missing = [];
    for (const group of groups) {
      const fieldIds = [...new Set((group?.fieldIds || []).map((value) => String(value || '').trim()).filter(Boolean))];
      if (fieldIds.length === 0) continue;

      const hasAny = fieldIds.some((fieldId) => {
        const field = fieldById.get(fieldId);
        if (!field) return false;
        const key = inputKeyForField(field);
        return hasRunValue(field.type, values[key]);
      });
      if (!hasAny) missing.push(group);
    }
    return missing;
  }

  function isGewerkSelectionRequiredMissing(section, values = runValues) {
    const options = sectionRunOptions(section, values);
    return missingRequiredAnyGroups(section, values, options).some((group) =>
      String(group?.groupId || '').startsWith('gewerk:')
    );
  }

  function isShiftSelectionRequiredMissing(section, values = runValues) {
    const options = sectionRunOptions(section, values);
    return missingRequiredAnyGroups(section, values, options).some((group) =>
      String(group?.groupId || '').startsWith('shift:')
    );
  }

  function sectionRunOptions(section, values = {}) {
    if (!section) return {};
    if (section.kind === 'table') {
      return {
        visibleRowCount: visibleRowCountForSection(section, values)
      };
    }
    if (section.kind === 'single') {
      return {
        requiredAnyGroups: requiredAnyGroupsForSection(section)
      };
    }
    return {};
  }

  function addRunTableRow(section) {
    if (!section || section.kind !== 'table') return;
    const maxRows = (section.rows || []).length;
    if (maxRows <= 1) return;

    const current = visibleRowCountForSection(section, runValues);
    if (current >= maxRows) return;
    const next = current + 1;
    setRunValue(tableRowCountKey(section.tableId), next);
    runInfo = `Zeile ${next} freigeschaltet.`;
    runError = '';
  }

  async function refreshHomeData() {
    const allTemplates = await listTemplates();
    templates = allTemplates
      .filter(
        (template) =>
          String(template?.templateKind || '').trim() === ETB_TEMPLATE_KIND ||
          String(template?.fileName || '').trim() === ETB_TEMPLATE_FILE_NAME
      )
      .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .slice(0, 1);

    builtinTemplateId = String(templates[0]?.templateId || '').trim();
    runs = builtinTemplateId ? await listRuns(builtinTemplateId) : [];
    const availableRunIds = new Set(runs.map((run) => String(run?.runId || '').trim()).filter(Boolean));
    selectedHomeRunIds = selectedHomeRunIds.filter((runId) => availableRunIds.has(String(runId || '').trim()));
    if (!homeSelectionMode) selectedHomeRunIds = [];
  }

  function clearHomeMessages() {
    homeError = '';
    homeInfo = '';
  }

  function normalizeRunTitle(value) {
    return String(value || '').trim();
  }

  function parseUtcDateParts(year, month, day) {
    const y = Number(year);
    const m = Number(month);
    const d = Number(day);
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    if (m < 1 || m > 12 || d < 1 || d > 31) return null;

    const date = new Date(Date.UTC(y, m - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
    return date;
  }

  function parseBtbDateValue(value) {
    const raw = String(value || '').trim();
    if (!raw) return null;

    const dmy = raw.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{2,4})$/);
    if (dmy) {
      const day = Number(dmy[1]);
      const month = Number(dmy[2]);
      const yearToken = Number(dmy[3]);
      const year = dmy[3].length === 2 ? 2000 + yearToken : yearToken;
      return parseUtcDateParts(year, month, day);
    }

    const ymd = raw.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
    if (ymd) {
      return parseUtcDateParts(ymd[1], ymd[2], ymd[3]);
    }

    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return null;
    return parseUtcDateParts(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  function btbDateFromRunValues(values = {}) {
    const entries = Object.entries(values || {}).filter(([, value]) => String(value ?? '').trim().length > 0);
    if (entries.length === 0) return null;

    const keyPatterns = [/^Date1$/i, /^field:date1(?:-|$)/i, /date1/i];
    for (const pattern of keyPatterns) {
      for (const [key, value] of entries) {
        if (!pattern.test(String(key || '').trim())) continue;
        const parsed = parseBtbDateValue(value);
        if (parsed) return parsed;
      }
    }
    return null;
  }

  function btbDateFromRunTitle(title = '') {
    const match = String(title || '').match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (!match) return null;
    return parseUtcDateParts(match[1], match[2], match[3]);
  }

  function btbDateForRun(run) {
    const fromValues = btbDateFromRunValues(run?.values || {});
    if (fromValues) return fromValues;
    return btbDateFromRunTitle(run?.title || '');
  }

  function isoWeekMeta(date) {
    const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const weekday = target.getUTCDay() || 7;
    target.setUTCDate(target.getUTCDate() + 4 - weekday);
    const weekYear = target.getUTCFullYear();
    const yearStart = new Date(Date.UTC(weekYear, 0, 1));
    const weekNumber = Math.ceil((((target - yearStart) / DAY_MS) + 1) / 7);
    return {
      weekYear,
      weekNumber
    };
  }

  function buildHomeRunWeekGroups(runList = []) {
    const groupMap = new Map();
    const rows = Array.isArray(runList) ? runList : [];

    for (const run of rows) {
      const btbDate = btbDateForRun(run);
      let weekKey = 'week:unknown';
      let weekLabel = 'Ohne BTB-Datum';
      let weekYear = null;
      let weekNumber = null;

      if (btbDate) {
        const meta = isoWeekMeta(btbDate);
        weekYear = meta.weekYear;
        weekNumber = meta.weekNumber;
        weekKey = `week:${weekYear}-${String(weekNumber).padStart(2, '0')}`;
        weekLabel = `KW ${String(weekNumber).padStart(2, '0')}`;
      }

      if (!groupMap.has(weekKey)) {
        groupMap.set(weekKey, {
          weekKey,
          weekLabel,
          weekYear,
          weekNumber,
          items: []
        });
      }
      groupMap.get(weekKey).items.push({ run, btbDate });
    }

    return [...groupMap.values()]
      .sort((a, b) => {
        const aKnown = a.weekYear != null && a.weekNumber != null;
        const bKnown = b.weekYear != null && b.weekNumber != null;
        if (aKnown !== bKnown) return aKnown ? -1 : 1;
        if (!aKnown && !bKnown) return 0;
        if (a.weekYear !== b.weekYear) return Number(b.weekYear) - Number(a.weekYear);
        return Number(b.weekNumber) - Number(a.weekNumber);
      })
      .map((group) => ({
        ...group,
        runs: group.items
          .sort((a, b) => {
            const aTime = a.btbDate ? a.btbDate.getTime() : Number.NEGATIVE_INFINITY;
            const bTime = b.btbDate ? b.btbDate.getTime() : Number.NEGATIVE_INFINITY;
            if (aTime !== bTime) return bTime - aTime;
            return String(b.run?.updatedAt || '').localeCompare(String(a.run?.updatedAt || ''));
          })
          .map((entry) => entry.run)
      }));
  }

  async function renameRunEntry(runLike, { scope = 'home' } = {}) {
    const runId = String(runLike?.runId || '').trim();
    if (!runId || typeof window === 'undefined') return;

    const currentTitle = String(runLike?.title || '').trim();
    if (scope === 'run') {
      runError = '';
      runInfo = '';
    } else {
      homeError = '';
      homeInfo = '';
    }

    const entered = window.prompt('Neuer Name für das BTB:', currentTitle);
    if (entered === null) return;

    const nextTitle = normalizeRunTitle(entered);
    if (!nextTitle) {
      if (scope === 'run') runError = 'Name darf nicht leer sein.';
      else homeError = 'Name darf nicht leer sein.';
      return;
    }
    if (nextTitle === currentTitle) return;

    try {
      const updated = await updateRun(runId, { title: nextTitle });
      if (!updated) {
        if (scope === 'run') runError = 'BTB konnte nicht umbenannt werden.';
        else homeError = 'BTB konnte nicht umbenannt werden.';
        return;
      }

      if (activeRun && String(activeRun.runId || '') === runId) {
        activeRun = updated;
      }
      await refreshHomeData();

      if (scope === 'run') {
        runInfo = 'BTB-Name aktualisiert.';
      } else {
        homeInfo = 'BTB-Name aktualisiert.';
      }
    } catch (error) {
      if (scope === 'run') runError = error?.message || 'BTB konnte nicht umbenannt werden.';
      else homeError = error?.message || 'BTB konnte nicht umbenannt werden.';
    }
  }

  function clearHomeRunSelectionPulse() {
    if (homeRunSelectionPulseTimer) {
      clearTimeout(homeRunSelectionPulseTimer);
      homeRunSelectionPulseTimer = null;
    }
    homeRunSelectionPulseIds = [];
  }

  function triggerHomeRunSelectionPulse(runIds = []) {
    const normalizedIds = [...new Set((runIds || []).map((runId) => String(runId || '').trim()).filter(Boolean))];
    if (normalizedIds.length === 0) return;
    homeRunSelectionPulseIds = normalizedIds;
    if (homeRunSelectionPulseTimer) {
      clearTimeout(homeRunSelectionPulseTimer);
    }
    homeRunSelectionPulseTimer = setTimeout(() => {
      homeRunSelectionPulseIds = [];
      homeRunSelectionPulseTimer = null;
    }, 320);
  }

  function toggleHomeSelectionMode() {
    homeSelectionMode = !homeSelectionMode;
    if (!homeSelectionMode) {
      selectedHomeRunIds = [];
      clearHomeRunSelectionPulse();
    }
    homeError = '';
    homeInfo = '';
  }

  function toggleHomeWeekGroup(weekKey) {
    const normalizedWeekKey = String(weekKey || '').trim();
    if (!normalizedWeekKey) return;
    if (homeExpandedWeekKeys.includes(normalizedWeekKey)) {
      homeExpandedWeekKeys = homeExpandedWeekKeys.filter((key) => key !== normalizedWeekKey);
    } else {
      homeExpandedWeekKeys = [...homeExpandedWeekKeys, normalizedWeekKey];
    }
  }

  function toggleHomeRunSelection(runId) {
    if (!homeSelectionMode) return;
    const normalizedRunId = String(runId || '').trim();
    if (!normalizedRunId) return;
    if (selectedHomeRunIds.includes(normalizedRunId)) {
      selectedHomeRunIds = selectedHomeRunIds.filter((entry) => entry !== normalizedRunId);
    } else {
      selectedHomeRunIds = [...selectedHomeRunIds, normalizedRunId];
      triggerHomeRunSelectionPulse([normalizedRunId]);
    }
    homeError = '';
    homeInfo = '';
  }

  function handleHomeRunCardClick(event, runId) {
    if (!homeSelectionMode) return;
    if (event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button, a, input, select, textarea, label')) return;
    toggleHomeRunSelection(runId);
  }

  function handleHomeRunCardKeydown(event, runId) {
    if (!homeSelectionMode) return;
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const target = event.target;
    if (
      target instanceof HTMLElement &&
      target !== event.currentTarget &&
      target.closest('button, a, input, select, textarea, label')
    ) {
      return;
    }
    event.preventDefault();
    toggleHomeRunSelection(runId);
  }

  function selectAllHomeRuns() {
    if (!homeSelectionMode) return;
    selectedHomeRunIds = [...selectableHomeRunIds];
    triggerHomeRunSelectionPulse(selectableHomeRunIds);
    homeError = '';
    homeInfo = '';
  }

  async function deleteSelectedHomeRuns() {
    const selectedRuns = runs.filter((run) => selectedHomeRunIds.includes(String(run?.runId || '').trim()));
    if (selectedRuns.length === 0 || homeRunDeleteBusy) return;
    if (typeof window === 'undefined') return;

    homeError = '';
    homeInfo = '';
    const listedTitles = selectedRuns
      .slice(0, 6)
      .map((run) => `- ${run.title}`)
      .join('\n');
    const moreHint = selectedRuns.length > 6 ? `\n... und ${selectedRuns.length - 6} weitere` : '';
    const countLabel = selectedRuns.length === 1 ? '1 BTB' : `${selectedRuns.length} BTB`;
    const confirmed = window.confirm(`${countLabel} wirklich löschen?\n\n${listedTitles}${moreHint}\n\nExport-Historie wird ebenfalls gelöscht.`);
    if (!confirmed) return;

    homeRunDeleteBusy = true;
    try {
      let deletedRuns = 0;
      let deletedExports = 0;
      for (const run of selectedRuns) {
        const result = await deleteRunCascade(run.runId);
        if (result?.deletedRun) deletedRuns += 1;
        deletedExports += Number(result?.deletedExports || 0);
      }
      await refreshHomeData();
      selectedHomeRunIds = [];
      homeSelectionMode = false;
      clearHomeRunSelectionPulse();
      if (deletedRuns > 0) {
        const runLabel = deletedRuns === 1 ? '1 BTB gelöscht' : `${deletedRuns} BTB gelöscht`;
        homeInfo = `${runLabel}. ${deletedExports} Export-Eintrag/Einträge entfernt.`;
      } else {
        homeInfo = 'Ausgewählte BTB waren bereits gelöscht.';
      }
    } catch (error) {
      homeError = error?.message || 'Ausgewählte BTB konnten nicht gelöscht werden.';
    } finally {
      homeRunDeleteBusy = false;
    }
  }

  async function initializeBuiltinTemplate({ force = false } = {}) {
    clearHomeMessages();
    if (uploadBusy) return;

    uploadBusy = true;
    try {
      const allTemplates = await listTemplates();
      let existingTemplate = allTemplates.find(
        (template) =>
          String(template?.templateKind || '').trim() === ETB_TEMPLATE_KIND ||
          String(template?.fileName || '').trim() === ETB_TEMPLATE_FILE_NAME
      );

      const existingSetup = existingTemplate ? await getSetupModel(existingTemplate.templateId) : null;
      const hasCurrentSetup = existingTemplate && existingSetup && Number(existingSetup?.version || 0) >= ETB_SETUP_VERSION;

      if (hasCurrentSetup && !force) {
        await refreshHomeData();
        const templateReady = String(existingTemplate?.status || '').toLowerCase() === 'ready';
        homeInfo = templateReady ? '' : 'Vorlage-eBTB geladen. Setup kann angepasst werden.';
        return;
      }

      const response = await fetch(ETB_TEMPLATE_PUBLIC_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Vorlage-eBTB konnte nicht geladen werden.');
      }

      const blob = await response.blob();
      const file = new File([blob], ETB_TEMPLATE_FILE_NAME, { type: blob.type || 'application/pdf' });
      if (file.size > MAX_PDF_SIZE) {
        throw new Error('Vorlage-eBTB überschreitet 40 MB und kann nicht verarbeitet werden.');
      }

      const scanResult = await scanTemplatePdf(file);
      if (!existingTemplate) {
        existingTemplate = await createTemplate({
          templateName: ETB_TEMPLATE_NAME,
          fileName: ETB_TEMPLATE_FILE_NAME,
          templateKind: ETB_TEMPLATE_KIND,
          mimeType: file.type || 'application/pdf',
          sizeBytes: file.size,
          pdfBlob: file,
          pageCount: scanResult.pageCount
        });
      } else {
        existingTemplate = await putTemplate({
          ...existingTemplate,
          templateName: ETB_TEMPLATE_NAME,
          fileName: ETB_TEMPLATE_FILE_NAME,
          templateKind: ETB_TEMPLATE_KIND,
          mimeType: file.type || 'application/pdf',
          sizeBytes: file.size,
          pageCount: scanResult.pageCount,
          pdfBlob: file,
          status: 'draft'
        });
      }

      const detectedFields = await saveDetectedFields(existingTemplate.templateId, scanResult.detectedFields);
      const setupModel = buildEtbSetupModel({
        templateId: existingTemplate.templateId,
        pageCount: scanResult.pageCount,
        detectedFields
      });

      await saveSetupModel(existingTemplate.templateId, setupModel, { status: 'ready' });
      await markTemplateReady(existingTemplate.templateId);
      await refreshHomeData();
      homeInfo = force ? 'Vorlage-eBTB wurde neu eingelesen und fix definiert.' : '';
    } catch (error) {
      homeError = error?.message || 'Vorlage-eBTB konnte nicht verarbeitet werden.';
    } finally {
      uploadBusy = false;
    }
  }

  function cloneModel(model) {
    return JSON.parse(JSON.stringify(model || {}));
  }

  function updateSetupModel(mutator) {
    if (!setupModelDraft) return;
    const next = cloneModel(setupModelDraft);
    mutator(next);
    next.updatedAt = new Date().toISOString();
    setupModelDraft = next;
    scheduleSetupAutosave();
  }

  function scheduleSetupAutosave() {
    if (view !== 'setup') return;
    if (!setupTemplate || !setupModelDraft) return;
    if (setupAutosaveTimer) clearTimeout(setupAutosaveTimer);
    setupAutosaveTimer = setTimeout(() => {
      setupAutosaveTimer = null;
      persistSetupAutosave();
    }, 420);
  }

  async function persistSetupAutosave() {
    if (!setupTemplate || !setupModelDraft || setupSaving || setupAutosaveBusy || view !== 'setup') return;
    setupAutosaveBusy = true;
    try {
      const snapshot = cloneModel(setupModelDraft);
      await saveSetupModel(setupTemplate.templateId, snapshot, { status: 'draft' });
      setupError = '';
    } catch (error) {
      setupError = error?.message || 'Setup konnte nicht gespeichert werden.';
    } finally {
      setupAutosaveBusy = false;
    }
  }

  async function waitForSetupAutosaveIdle() {
    while (setupAutosaveBusy) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
  }

  async function flushSetupAutosave() {
    if (setupAutosaveTimer) {
      clearTimeout(setupAutosaveTimer);
      setupAutosaveTimer = null;
    }
    await waitForSetupAutosaveIdle();
    await persistSetupAutosave();
  }

  async function leaveSetupToHome() {
    await flushSetupAutosave();
    view = 'home';
  }

  async function openSetup(templateId) {
    clearHomeMessages();
    setupError = '';
    setupInfo = '';
    setupPreviewDoc = null;
    setupModelDraft = null;
    setupFields = [];
    setupFieldById = new Map();

    const template = await getTemplate(templateId);
    const fields = await getDetectedFields(templateId);
    const setupModel = await getSetupModel(templateId);
    if (!template || !setupModel) {
      homeError = 'Setup konnte nicht geladen werden.';
      return;
    }

    setupTemplate = template;
    setupFields = fields;
    setupFieldById = new Map(fields.map((field) => [String(field.fieldId), field]));
    setupModelDraft = cloneModel(setupModel);
    setupMode = (setupModel.single_sections || []).length > 0 ? 'single' : 'table';
    setupActiveSingleSectionId = String((setupModel.single_sections || [])[0]?.sectionId || '');
    setupActiveTableId = String((setupModel.table_sections || [])[0]?.tableId || '');
    setupSectionRenderNonce = 0;
    view = 'setup';

    try {
      setupPreviewDoc = await loadPdfPreviewDocument(template.pdfBlob);
      const firstField = firstFieldInSingleSection(setupModel.single_sections?.[0]) || setupFields[0];
      if (firstField) {
        focusSetupPreview(firstField);
      }
      await renderSetupPreview();
    } catch (error) {
      setupError = error?.message || 'PDF-Vorschau konnte nicht geladen werden.';
    }
  }

  function fieldFromRegistry(fieldLike) {
    if (!fieldLike) return null;
    const fieldId = String(fieldLike.fieldId || '').trim();
    if (fieldId && setupFieldById.has(fieldId)) return setupFieldById.get(fieldId);
    return fieldLike;
  }

  function firstFieldInSingleSection(section) {
    if (!section) return null;
    for (const item of section.fields || []) {
      const resolved = fieldFromRegistry(item);
      if (resolved && Array.isArray(resolved.rect) && resolved.rect.length >= 4) return resolved;
    }
    return null;
  }

  function firstFieldInTableSection(table) {
    if (!table) return null;
    for (const row of table.rows || []) {
      for (const cell of row.cells || []) {
        const resolved = fieldFromRegistry(cell);
        if (resolved && Array.isArray(resolved.rect) && resolved.rect.length >= 4) return resolved;
      }
    }
    return null;
  }

  function focusTableColumnPreview(table, columnId) {
    if (!table) return;
    for (const row of table.rows || []) {
      const cell = (row.cells || []).find((entry) => String(entry.columnId) === String(columnId));
      if (!cell) continue;
      const resolved = fieldFromRegistry(cell);
      if (!resolved) continue;
      focusSetupPreview(resolved);
      return;
    }
  }

  function focusTableRowPreview(table, rowId) {
    if (!table) return;
    const row = (table.rows || []).find((entry) => String(entry.rowId) === String(rowId));
    if (!row) return;
    for (const cell of row.cells || []) {
      const resolved = fieldFromRegistry(cell);
      if (!resolved) continue;
      focusSetupPreview(resolved);
      return;
    }
  }

  function focusTableCellPreview(cell) {
    const resolved = fieldFromRegistry(cell);
    if (!resolved) return;
    focusSetupPreview(resolved);
  }

  function previewMarkerFromFieldLike(fieldLike, mode = 'context') {
    const resolved = fieldFromRegistry(fieldLike);
    if (!resolved) return null;
    const rect = Array.isArray(resolved.rect) ? resolved.rect.slice(0, 4) : null;
    if (!rect) return null;
    return {
      fieldId: String(resolved.fieldId || fieldLike?.fieldId || '').trim(),
      fieldName: String(resolved.labelCandidate || resolved.fieldName || fieldLike?.label || '').trim(),
      page: Number(resolved.page || fieldLike?.page || setupPreviewTarget?.page || 1),
      rect,
      mode
    };
  }

  function dedupePreviewMarkers(markers = []) {
    const rank = {
      base: 1,
      context: 2,
      active: 3
    };
    const map = new Map();
    for (const marker of markers || []) {
      if (!marker || !Array.isArray(marker.rect) || marker.rect.length < 4) continue;
      const fieldId = String(marker.fieldId || '').trim();
      const key = fieldId
        ? `id:${fieldId}`
        : `rect:${Number(marker.page || 1)}:${marker.rect.map((value) => Number(value || 0)).join(',')}`;
      const existing = map.get(key);
      if (!existing || (rank[marker.mode] || 0) >= (rank[existing.mode] || 0)) {
        map.set(key, marker);
      }
    }
    return [...map.values()];
  }

  function buildSetupPreviewMarkers() {
    const targetPage = Number(setupPreviewTarget?.page || 1);
    const markers = [];

    for (const field of setupFields || []) {
      if (Number(field.page || 1) !== targetPage) continue;
      const marker = previewMarkerFromFieldLike(field, 'base');
      if (marker) markers.push(marker);
    }

    if (setupMode === 'single' && activeSetupSingleSection) {
      for (const field of activeSetupSingleSection.fields || []) {
        const marker = previewMarkerFromFieldLike(field, 'context');
        if (marker) markers.push(marker);
      }
    }

    if (setupMode === 'table' && activeSetupTableSection) {
      for (const row of activeSetupTableSection.rows || []) {
        for (const cell of row.cells || []) {
          const marker = previewMarkerFromFieldLike(cell, 'context');
          if (marker) markers.push(marker);
        }
      }
    }

    if (setupFocusedFieldId) {
      const focused = setupFieldById.get(String(setupFocusedFieldId || '').trim());
      const marker = previewMarkerFromFieldLike(
        focused || {
          fieldId: setupFocusedFieldId,
          page: targetPage,
          rect: Array.isArray(setupPreviewTarget?.rect) ? setupPreviewTarget.rect.slice(0, 4) : null
        },
        'active'
      );
      if (marker) markers.push(marker);
    } else if (Array.isArray(setupPreviewTarget?.rect) && setupPreviewTarget.rect.length >= 4) {
      markers.push({
        fieldId: '',
        fieldName: '',
        page: targetPage,
        rect: setupPreviewTarget.rect.slice(0, 4),
        mode: 'active'
      });
    }

    return dedupePreviewMarkers(markers);
  }

  function focusSetupPreview(fieldLike) {
    const resolved = fieldFromRegistry(fieldLike);
    if (!resolved) return;
    const rect = Array.isArray(resolved.rect)
      ? resolved.rect.slice(0, 4)
      : Array.isArray(fieldLike?.rect)
        ? fieldLike.rect.slice(0, 4)
        : null;
    setupPreviewTarget = {
      page: Number(resolved.page || fieldLike?.page || 1),
      rect
    };
    setupFocusedFieldId = String(resolved.fieldId || fieldLike?.fieldId || '').trim();
    setupFocusedFieldLabel = String(
      resolved.labelCandidate || fieldLike?.label || resolved.fieldName || fieldLike?.fieldName || ''
    ).trim();
    renderSetupPreview();
  }

  async function renderSetupPreview() {
    if (!setupCanvas || !setupPreviewDoc) return;
    const token = ++setupPreviewToken;
    const payload = {
      pdfJsDoc: setupPreviewDoc,
      pageNumber: setupPreviewTarget?.page || 1,
      rect: setupPreviewTarget?.rect || null,
      highlights: setupPreviewMarkers,
      activeFieldId: setupFocusedFieldId,
      canvas: setupCanvas
    };

    setupPreviewQueue = setupPreviewQueue
      .catch(() => {})
      .then(async () => {
        if (token !== setupPreviewToken) return;
        try {
          await renderFieldPreview(payload);
        } catch {
          // Ignore canvas race conditions.
        }
      });

    await setupPreviewQueue;
  }

  $: if (view === 'setup' && setupCanvas && setupPreviewDoc) {
    setupPreviewMarkers.length;
    renderSetupPreview();
  }

  function firstFieldInRunSection(section, values = runValues) {
    if (!section) return null;
    if (section.kind === 'single') {
      for (const field of section.fields || []) {
        const resolved = fieldFromRegistry(field);
        if (resolved && Array.isArray(resolved.rect) && resolved.rect.length >= 4) return resolved;
      }
      return null;
    }

    if (section.kind === 'table') {
      const rows = visibleRowsForSection(section, values);
      for (const row of rows) {
        for (const cell of row.cells || []) {
          const resolved = fieldFromRegistry(cell);
          if (resolved && Array.isArray(resolved.rect) && resolved.rect.length >= 4) return resolved;
        }
      }
    }
    return null;
  }

  function runPreviewMarkerFromFieldLike(fieldLike, mode = 'context') {
    const resolved = fieldFromRegistry(fieldLike);
    if (!resolved) return null;
    const rect = Array.isArray(resolved.rect)
      ? resolved.rect.slice(0, 4)
      : Array.isArray(fieldLike?.rect)
        ? fieldLike.rect.slice(0, 4)
        : null;
    if (!rect) return null;
    return {
      fieldId: String(resolved.fieldId || fieldLike?.fieldId || '').trim(),
      fieldName: String(resolved.labelCandidate || fieldLike?.label || resolved.fieldName || fieldLike?.fieldName || '').trim(),
      page: Number(resolved.page || fieldLike?.page || runPreviewTarget?.page || 1),
      rect,
      mode
    };
  }

  function buildRunPreviewMarkers() {
    const targetPage = Number(runPreviewTarget?.page || 1);
    const markers = [];

    if (activeSection?.kind === 'single') {
      for (const field of activeSection.fields || []) {
        const marker = runPreviewMarkerFromFieldLike(field, 'context');
        if (marker) markers.push(marker);
      }
    }

    if (activeSection?.kind === 'table') {
      const rows = visibleRowsForSection(activeSection, runValues);
      for (const row of rows) {
        for (const cell of row.cells || []) {
          const marker = runPreviewMarkerFromFieldLike(cell, 'context');
          if (marker) markers.push(marker);
        }
      }
    }

    if (runFocusedFieldId) {
      const focused = setupFieldById.get(String(runFocusedFieldId || '').trim());
      const marker = runPreviewMarkerFromFieldLike(
        focused || {
          fieldId: runFocusedFieldId,
          page: targetPage,
          rect: Array.isArray(runPreviewTarget?.rect) ? runPreviewTarget.rect.slice(0, 4) : null
        },
        'active'
      );
      if (marker) markers.push(marker);
    } else if (Array.isArray(runPreviewTarget?.rect) && runPreviewTarget.rect.length >= 4) {
      markers.push({
        fieldId: '',
        fieldName: '',
        page: targetPage,
        rect: runPreviewTarget.rect.slice(0, 4),
        mode: 'active'
      });
    }

    return dedupePreviewMarkers(markers);
  }

  function buildRunPreviewValueOverlays() {
    const overlays = [];
    const addOverlay = (fieldLike, valueKey) => {
      if (!fieldLike || !valueKey) return;
      const marker = runPreviewMarkerFromFieldLike(fieldLike, 'context');
      if (!marker) return;

      const resolved = fieldFromRegistry(fieldLike) || fieldLike;
      const type = String(fieldLike?.type || resolved?.type || 'text').toLowerCase();
      const rawValue = runValues[String(valueKey)];

      if (type === 'checkbox') {
        if (rawValue !== true) return;
      } else if (!String(rawValue ?? '').trim()) {
        return;
      }

      overlays.push({
        fieldId: marker.fieldId,
        fieldName: String(resolved?.fieldName || fieldLike?.fieldName || '').trim(),
        page: marker.page,
        rect: marker.rect.slice(0, 4),
        type,
        value: rawValue
      });
    };

    for (const section of runSections || []) {
      if (section?.kind === 'single') {
        for (const field of section.fields || []) {
          addOverlay(field, inputKeyForField(field));
        }
        continue;
      }

      if (section?.kind === 'table') {
        const rows = visibleRowsForSection(section, runValues);
        for (const row of rows) {
          for (const cell of row.cells || []) {
            addOverlay(cell, inputKeyForCell(cell));
          }
        }
      }
    }

    return overlays;
  }

  function focusRunPreview(fieldLike) {
    const resolved = fieldFromRegistry(fieldLike);
    if (!resolved) return;
    const rect = Array.isArray(resolved.rect)
      ? resolved.rect.slice(0, 4)
      : Array.isArray(fieldLike?.rect)
        ? fieldLike.rect.slice(0, 4)
        : null;
    runPreviewTarget = {
      page: Number(resolved.page || fieldLike?.page || 1),
      rect
    };
    runFocusedFieldId = String(resolved.fieldId || fieldLike?.fieldId || '').trim();
    renderRunPreview();
  }

  async function renderRunPreview() {
    if (!runCanvas || !runPreviewDoc) return;
    const token = ++runPreviewToken;
    const payload = {
      pdfJsDoc: runPreviewDoc,
      pageNumber: runPreviewTarget?.page || 1,
      rect: runPreviewTarget?.rect || null,
      highlights: runPreviewMarkers,
      valueOverlays: buildRunPreviewValueOverlays(),
      activeFieldId: runFocusedFieldId,
      canvas: runCanvas,
      maxWidth: 680
    };

    runPreviewQueue = runPreviewQueue
      .catch(() => {})
      .then(async () => {
        if (token !== runPreviewToken) return;
        try {
          await renderFieldPreview(payload);
        } catch {
          // Ignore canvas race conditions.
        }
      });

    await runPreviewQueue;
  }

  $: if (view === 'run' && runCanvas && runPreviewDoc) {
    runPreviewMarkers.length;
    renderRunPreview();
  }

  function findTable(tableId) {
    return (setupModelDraft?.table_sections || []).find((table) => String(table.tableId) === String(tableId));
  }

  function selectSetupSingleSection(sectionId) {
    detachSetupFieldDragListeners();
    clearSetupFieldDragState();
    const nextId = String(sectionId || '').trim();
    if (nextId && nextId !== String(setupActiveSingleSectionId || '').trim()) {
      setupSectionRenderNonce += 1;
    }
    setupMode = 'single';
    setupActiveSingleSectionId = nextId;
    const section = (setupModelDraft?.single_sections || []).find(
      (entry) => String(entry.sectionId) === String(setupActiveSingleSectionId)
    );
    const first = firstFieldInSingleSection(section);
    if (first) focusSetupPreview(first);
  }

  function selectSetupTable(tableId) {
    detachSetupFieldDragListeners();
    clearSetupFieldDragState();
    const nextId = String(tableId || '').trim();
    if (nextId && nextId !== String(setupActiveTableId || '').trim()) {
      setupSectionRenderNonce += 1;
    }
    setupMode = 'table';
    setupActiveTableId = nextId;
    const table = (setupModelDraft?.table_sections || []).find(
      (entry) => String(entry.tableId) === String(setupActiveTableId)
    );
    const first = firstFieldInTableSection(table);
    if (first) focusSetupPreview(first);
  }

  function clearSetupFieldDragState() {
    setupDragFieldId = '';
    setupDropFieldId = '';
    setupDropPosition = 'before';
    setupDragPointerId = null;
  }

  function detachSetupFieldDragListeners() {
    if (typeof window === 'undefined') return;
    window.removeEventListener('pointermove', onSetupFieldDragMove);
    window.removeEventListener('pointerup', onSetupFieldDragEnd);
    window.removeEventListener('pointercancel', onSetupFieldDragCancel);
  }

  function moveSingleFieldWithinSection(sectionId, draggedFieldId, targetFieldId, position = 'before') {
    const sectionKey = String(sectionId || '').trim();
    const draggedKey = String(draggedFieldId || '').trim();
    const targetKey = String(targetFieldId || '').trim();
    if (!sectionKey || !draggedKey || !targetKey || draggedKey === targetKey) return;

    updateSetupModel((model) => {
      const section = (model.single_sections || []).find((entry) => String(entry.sectionId) === sectionKey);
      if (!section || !Array.isArray(section.fields)) return;
      const fields = [...section.fields];
      const draggedIndex = fields.findIndex((field) => String(field.fieldId) === draggedKey);
      const targetIndexOriginal = fields.findIndex((field) => String(field.fieldId) === targetKey);
      if (draggedIndex < 0 || targetIndexOriginal < 0) return;

      const [draggedField] = fields.splice(draggedIndex, 1);
      if (!draggedField) return;
      const targetIndex = fields.findIndex((field) => String(field.fieldId) === targetKey);
      if (targetIndex < 0) {
        fields.push(draggedField);
      } else {
        const insertAt = position === 'after' ? targetIndex + 1 : targetIndex;
        fields.splice(insertAt, 0, draggedField);
      }
      section.fields = fields;
    });

    setupInfo = 'Feldreihenfolge aktualisiert.';
    setupError = '';
  }

  function startSetupFieldDrag(event, fieldId) {
    if (!activeSetupSingleSection) return;
    const normalizedFieldId = String(fieldId || '').trim();
    if (!normalizedFieldId) return;

    event.preventDefault();
    setupDragPointerId = Number(event.pointerId);
    setupDragFieldId = normalizedFieldId;
    setupDropFieldId = normalizedFieldId;
    setupDropPosition = 'after';

    detachSetupFieldDragListeners();
    window.addEventListener('pointermove', onSetupFieldDragMove, { passive: false });
    window.addEventListener('pointerup', onSetupFieldDragEnd, { passive: false });
    window.addEventListener('pointercancel', onSetupFieldDragCancel, { passive: false });
  }

  function onSetupFieldDragMove(event) {
    if (!setupDragFieldId) return;
    if (setupDragPointerId !== null && Number(event.pointerId) !== Number(setupDragPointerId)) return;
    event.preventDefault();

    const node = document.elementFromPoint(event.clientX, event.clientY);
    const card = node?.closest?.('[data-setup-field-id]');
    if (!card) return;
    const targetFieldId = String(card?.dataset?.setupFieldId || '').trim();
    if (!targetFieldId) return;

    const rect = card.getBoundingClientRect();
    const midpointY = rect.top + rect.height / 2;
    setupDropFieldId = targetFieldId;
    setupDropPosition = event.clientY < midpointY ? 'before' : 'after';
  }

  function onSetupFieldDragEnd(event) {
    if (!setupDragFieldId) return;
    if (setupDragPointerId !== null && Number(event.pointerId) !== Number(setupDragPointerId)) return;
    event.preventDefault();

    const draggedFieldId = setupDragFieldId;
    const targetFieldId = setupDropFieldId;
    const position = setupDropPosition;
    const sectionId = activeSetupSingleSection?.sectionId;

    detachSetupFieldDragListeners();
    clearSetupFieldDragState();

    if (!sectionId || !draggedFieldId || !targetFieldId || draggedFieldId === targetFieldId) return;
    moveSingleFieldWithinSection(sectionId, draggedFieldId, targetFieldId, position);
  }

  function onSetupFieldDragCancel() {
    detachSetupFieldDragListeners();
    clearSetupFieldDragState();
  }

  function updateSingleField(sectionId, fieldId, patch) {
    updateSetupModel((model) => {
      for (const section of model.single_sections || []) {
        if (String(section.sectionId) !== String(sectionId)) continue;
        for (const field of section.fields || []) {
          if (String(field.fieldId) !== String(fieldId)) continue;
          Object.assign(field, patch || {});
        }
      }
    });
  }

  function updateSingleSectionLabel(sectionId, nextLabel) {
    updateSetupModel((model) => {
      const section = (model.single_sections || []).find((entry) => String(entry.sectionId) === String(sectionId));
      if (!section) return;
      section.label = String(nextLabel || '').trim() || section.label;
    });
  }

  function addSingleSection() {
    let createdSectionId = '';
    updateSetupModel((model) => {
      if (!Array.isArray(model.single_sections)) model.single_sections = [];
      const nextIndex = model.single_sections.length + 1;
      createdSectionId = `single_custom_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      model.single_sections.push({
        sectionId: createdSectionId,
        label: `Gruppe ${nextIndex}`,
        page: 1,
        fields: []
      });
    });
    if (createdSectionId) {
      setupMode = 'single';
      setupActiveSingleSectionId = createdSectionId;
      setupSectionRenderNonce += 1;
      setupInfo = 'Neue Gruppe angelegt.';
      setupError = '';
    }
  }

  function moveSingleFieldToSection(fromSectionId, fieldId, toSectionId) {
    const fromId = String(fromSectionId || '').trim();
    const toId = String(toSectionId || '').trim();
    const normalizedFieldId = String(fieldId || '').trim();
    if (!fromId || !toId || !normalizedFieldId || fromId === toId) return;

    updateSetupModel((model) => {
      const sections = Array.isArray(model.single_sections) ? model.single_sections : [];
      const source = sections.find((section) => String(section.sectionId) === fromId);
      const target = sections.find((section) => String(section.sectionId) === toId);
      if (!source || !target) return;

      const sourceFields = Array.isArray(source.fields) ? source.fields : [];
      const index = sourceFields.findIndex((field) => String(field.fieldId) === normalizedFieldId);
      if (index < 0) return;

      const [field] = sourceFields.splice(index, 1);
      if (!field) return;

      if (!Array.isArray(target.fields)) target.fields = [];
      if (target.fields.some((entry) => String(entry.fieldId) === normalizedFieldId)) return;
      target.fields.push(field);
    });
    setupMode = 'single';
    setupActiveSingleSectionId = toId;
    setupSectionRenderNonce += 1;
    const movedField = setupFieldById.get(normalizedFieldId);
    if (movedField) focusSetupPreview(movedField);
    setupInfo = 'Feld wurde in die gewählte Gruppe verschoben.';
    setupError = '';
  }

  function deleteSingleSection(sectionId) {
    const normalizedId = String(sectionId || '').trim();
    if (!normalizedId) return;

    const sections = setupModelDraft?.single_sections || [];
    if (sections.length <= 1) {
      setupError = 'Mindestens eine Gruppe muss bestehen bleiben.';
      setupInfo = '';
      return;
    }

    let fallbackSectionId = '';
    let movedCount = 0;
    updateSetupModel((model) => {
      const list = Array.isArray(model.single_sections) ? model.single_sections : [];
      const deleteIndex = list.findIndex((section) => String(section.sectionId) === normalizedId);
      if (deleteIndex < 0) return;

      const targetSection = list.find((_, index) => index !== deleteIndex);
      if (!targetSection) return;
      fallbackSectionId = String(targetSection.sectionId || '');

      const sourceSection = list[deleteIndex];
      const sourceFields = Array.isArray(sourceSection?.fields) ? sourceSection.fields : [];
      if (!Array.isArray(targetSection.fields)) targetSection.fields = [];

      for (const field of sourceFields) {
        const fieldId = String(field?.fieldId || '');
        if (fieldId && targetSection.fields.some((entry) => String(entry.fieldId) === fieldId)) continue;
        targetSection.fields.push(field);
        movedCount += 1;
      }

      list.splice(deleteIndex, 1);
    });

    if (fallbackSectionId) {
      setupMode = 'single';
      setupActiveSingleSectionId = fallbackSectionId;
      setupSectionRenderNonce += 1;
      const fallbackSection = (setupModelDraft?.single_sections || []).find(
        (section) => String(section.sectionId) === String(fallbackSectionId)
      );
      const fallbackField = firstFieldInSingleSection(fallbackSection);
      if (fallbackField) focusSetupPreview(fallbackField);
      setupInfo = movedCount > 0 ? `Gruppe gelöscht, ${movedCount} Felder verschoben.` : 'Leere Gruppe gelöscht.';
      setupError = '';
    }
  }

  function updateTableLabel(tableId, label) {
    updateSetupModel((model) => {
      const table = (model.table_sections || []).find((item) => String(item.tableId) === String(tableId));
      if (!table) return;
      table.label = String(label || '').trim() || table.label;
    });
  }

  function updateTableColumn(tableId, columnId, patch) {
    updateSetupModel((model) => {
      const table = (model.table_sections || []).find((item) => String(item.tableId) === String(tableId));
      if (!table) return;
      const column = (table.columns || []).find((item) => String(item.columnId) === String(columnId));
      if (!column) return;
      Object.assign(column, patch || {});

      for (const row of table.rows || []) {
        for (const cell of row.cells || []) {
          if (String(cell.columnId) !== String(columnId)) continue;
          cell.required = column.required === true;
          if (String(patch?.label || '').trim()) {
            cell.label = String(patch.label).trim();
          }
        }
      }
    });
  }

  function updateTableRow(tableId, rowId, patch) {
    updateSetupModel((model) => {
      const table = (model.table_sections || []).find((item) => String(item.tableId) === String(tableId));
      if (!table) return;
      const row = (table.rows || []).find((item) => String(item.rowId) === String(rowId));
      if (!row) return;
      Object.assign(row, patch || {});
    });
  }

  function updateTableCell(tableId, rowId, columnId, patch) {
    updateSetupModel((model) => {
      const table = (model.table_sections || []).find((item) => String(item.tableId) === String(tableId));
      if (!table) return;
      const row = (table.rows || []).find((item) => String(item.rowId) === String(rowId));
      if (!row) return;
      const cell = (row.cells || []).find((item) => String(item.columnId) === String(columnId));
      if (!cell) return;
      Object.assign(cell, patch || {});
    });
  }

  function mapCellField(tableId, rowId, columnId, nextFieldId) {
    const normalizedFieldId = String(nextFieldId || '').trim();
    const field = setupFieldById.get(normalizedFieldId);
    if (!field) {
      updateTableCell(tableId, rowId, columnId, {
        fieldId: '',
        fieldName: '',
        type: 'text',
        options: [],
        skipped: true,
        rect: null,
        page: findTable(tableId)?.page || 1
      });
      return;
    }

    updateTableCell(tableId, rowId, columnId, {
      fieldId: normalizedFieldId,
      fieldName: field.fieldName,
      type: field.type,
      options: Array.isArray(field.options) ? [...field.options] : [],
      skipped: false,
      rect: Array.isArray(field.rect) ? field.rect.slice(0, 4) : null,
      page: field.page
    });
    focusSetupPreview(field);
  }

  function fieldOptionLabel(field) {
    return `${field.fieldName} · Seite ${field.page}`;
  }

  function tableFieldOptions(table) {
    const page = Number(table?.page || 1);
    const samePage = setupFields.filter((field) => Number(field.page || 1) === page);
    return samePage.length > 0 ? samePage : setupFields;
  }

  async function saveSetupDraft() {
    if (!setupTemplate || !setupModelDraft || setupSaving) return;
    if (setupAutosaveTimer) {
      clearTimeout(setupAutosaveTimer);
      setupAutosaveTimer = null;
    }
    await waitForSetupAutosaveIdle();
    setupSaving = true;
    setupError = '';
    try {
      await saveSetupModel(setupTemplate.templateId, setupModelDraft, { status: 'draft' });
      setupInfo = `Setup gespeichert (${nowLabel()}).`;
      await refreshHomeData();
    } catch (error) {
      setupError = error?.message || 'Setup konnte nicht gespeichert werden.';
    } finally {
      setupSaving = false;
    }
  }

  async function finishSetup() {
    if (!setupTemplate || !setupModelDraft || setupSaving) return;
    if (setupAutosaveTimer) {
      clearTimeout(setupAutosaveTimer);
      setupAutosaveTimer = null;
    }
    await waitForSetupAutosaveIdle();
    setupError = '';
    setupInfo = '';

    const issues = validateSetupModel(setupModelDraft);
    if (issues.length > 0) {
      setupError = issues[0];
      return;
    }

    setupSaving = true;
    try {
      const readyModel = cloneModel(setupModelDraft);
      readyModel.status = 'ready';
      readyModel.updatedAt = new Date().toISOString();

      await saveSetupModel(setupTemplate.templateId, readyModel, { status: 'ready' });
      await markTemplateReady(setupTemplate.templateId);
      await refreshHomeData();

      view = 'home';
      setupTemplate = null;
      setupModelDraft = null;
      setupFields = [];
      setupPreviewDoc = null;
      homeInfo = 'Setup abgeschlossen. Vorlage ist startbereit.';
    } catch (error) {
      setupError = error?.message || 'Setup konnte nicht abgeschlossen werden.';
    } finally {
      setupSaving = false;
    }
  }

  async function startNewRun(templateId) {
    clearHomeMessages();
    const normalizedName = normalizeRunNameInput(newRunNameInput);
    if (!normalizedName) {
      homeError = 'Bitte zuerst den Namen für das BTB eingeben.';
      return;
    }

    const template = await getTemplate(templateId);
    const setupModel = await getSetupModel(templateId);
    if (!template || !setupModel) {
      homeError = 'Vorlage konnte nicht geladen werden.';
      return;
    }
    if (String(template.status || '').toLowerCase() !== 'ready') {
      homeError = 'Vorlage ist noch nicht startbereit. Bitte Setup abschließen.';
      return;
    }

    const run = await createRun({
      templateId,
      title: buildRunTitleByConvention(normalizedName),
      setupVersion: Number(setupModel.version || 1)
    });

    const defaults = applyRunDefaultsFromModel(setupModel, run.values || {});
    if (defaults.changed) {
      await updateRun(run.runId, {
        values: defaults.values
      });
    }

    newRunNameInput = '';
    await refreshHomeData();
    await openRun(run.runId);
  }

  async function openRun(runId) {
    runError = '';
    runInfo = '';
    runAutosave = 'Bereit';
    runReviewExpanded = false;
    runFinishDialogOpen = false;
    runPreviewDocBusy = false;
    clearPhotoDocObjectUrls();
    if (runAutosaveTimer) {
      clearTimeout(runAutosaveTimer);
      runAutosaveTimer = null;
    }

    const run = await getRun(runId);
    if (!run) {
      homeError = 'BTB nicht gefunden.';
      view = 'home';
      return;
    }

    const template = await getTemplate(run.templateId);
    const setupModel = await getSetupModel(run.templateId);
    const detectedFields = await getDetectedFields(run.templateId);
    if (!template || !setupModel) {
      homeError = 'Template-Daten für das BTB fehlen.';
      view = 'home';
      return;
    }

    activeRun = run;
    runTemplate = template;
    runModel = setupModel;
    setupFields = detectedFields;
    setupFieldById = new Map(detectedFields.map((field) => [String(field.fieldId), field]));
    runPhotoDoc = normalizeRunPhotoDoc(run.photoDoc);
    runValues = runValuesWithPhotoDocChoice({ ...(run.values || {}) }, runPhotoDoc.enabled);
    photoDocEditorOpen = false;
    const orderedSections = buildRunSectionsWithPhotoDoc(setupModel);
    activeSectionIndex = Math.max(0, Math.min(Number(run.sectionIndex || 0), Math.max(orderedSections.length - 1, 0)));
    runSectionRenderNonce = 0;
    runExports = await listExports(run.runId);
    runPreviewDoc = null;
    runPreviewPageCount = 1;
    runPreviewTarget = { page: 1, rect: null };
    runFocusedFieldId = '';
    view = 'run';
    await syncRunSectionInputs();

    try {
      await refreshRunPreviewDocument();
      const section = orderedSections[activeSectionIndex] || null;
      const first = firstFieldInRunSection(section, runValues);
      if (first) focusRunPreview(first);
      await renderRunPreview();
    } catch (error) {
      runError = error?.message || 'Run-Vorschau konnte nicht geladen werden.';
    }
  }

  async function persistRunAutosave() {
    if (!activeRun || runSaving) return;
    runSaving = true;
    try {
      const next = await updateRun(activeRun.runId, {
        values: runValuesWithPhotoDocChoice(runValues, runPhotoDoc.enabled),
        photoDoc: cloneRunPhotoDoc(runPhotoDoc),
        sectionIndex: activeSectionIndex,
        status: activeRun.status || 'draft'
      });
      if (next) activeRun = next;
      runAutosave = `Gespeichert ${nowLabel()}`;
      await refreshHomeData();
    } catch (error) {
      runAutosave = 'Autosave fehlgeschlagen';
      runError = error?.message || 'BTB konnte nicht gespeichert werden.';
    } finally {
      runSaving = false;
    }
  }

  function scheduleRunAutosave() {
    if (!activeRun) return;
    runAutosave = 'Speichert...';
    if (runAutosaveTimer) clearTimeout(runAutosaveTimer);
    runAutosaveTimer = setTimeout(() => {
      runAutosaveTimer = null;
      persistRunAutosave();
    }, 450);
  }

  async function flushRunAutosave() {
    if (runAutosaveTimer) {
      clearTimeout(runAutosaveTimer);
      runAutosaveTimer = null;
    }
    await persistRunAutosave();
  }

  function setRunValue(key, value) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    runValues = {
      ...runValues,
      [normalizedKey]: value
    };
    renderRunPreview();
    scheduleRunAutosave();
  }

  function isSingleFieldRequiredMissing(field, values = runValues) {
    if (!field || field.required !== true) return false;
    const key = inputKeyForField(field);
    return !hasRunValue(field.type, values[key]);
  }

  function isTableCellRequiredMissing(section, row, column, cell, values = runValues) {
    if (!section || section.kind !== 'table' || !row || !column || !cell) return false;
    if (column.required !== true) return false;
    const visibleRows = visibleRowsForSection(section, values);
    const firstRow = visibleRows[0];
    if (!firstRow || String(firstRow.rowId) !== String(row.rowId)) return false;
    const key = inputKeyForCell(cell);
    return !hasRunValue(cell.type, values[key]);
  }

  function missingRequiredInputsForSection(section, values = runValues) {
    if (!section) return [];
    if (isPhotoDocSection(section)) {
      if (!isPhotoDocRequiredMissing()) return [];
      return [
        {
          kind: 'photo-doc',
          inputKey: PHOTO_DOC_ENABLED_RUN_KEY,
          label: 'Fotodoku anlegen',
          fieldLike: null
        }
      ];
    }
    if (section.kind === 'single') {
      const missingSingles = (section.fields || [])
        .filter((field) => isSingleFieldRequiredMissing(field, values))
        .map((field) => ({
          kind: 'single',
          inputKey: inputKeyForField(field),
          label: field.label || field.fieldName || 'Pflichtfeld',
          fieldLike: field
        }));

      const options = sectionRunOptions(section, values);
      const missingGroups = missingRequiredAnyGroups(section, values, options).map((group) => {
        const fieldById = new Map(
          (section.fields || []).map((field) => [String(field?.fieldId || '').trim(), field]).filter(([id]) => !!id)
        );
        const firstFieldId = String((group?.fieldIds || [])[0] || '').trim();
        const firstField = fieldById.get(firstFieldId) || null;
        return {
          kind: 'single-group',
          inputKey: firstField ? inputKeyForField(firstField) : '',
          label: `${group?.label || 'Auswahl'} auswählen`,
          fieldLike: firstField
        };
      });

      return [...missingSingles, ...missingGroups];
    }

    if (section.kind === 'table') {
      const rows = visibleRowsForSection(section, values);
      const firstRow = rows[0];
      if (!firstRow) return [];
      const missing = [];
      for (const column of section.columns || []) {
        if (column.required !== true) continue;
        const cell = (firstRow.cells || []).find((entry) => String(entry.columnId) === String(column.columnId));
        if (!cell) continue;
        if (!isTableCellRequiredMissing(section, firstRow, column, cell, values)) continue;
        missing.push({
          kind: 'table',
          inputKey: inputKeyForCell(cell),
          label: `${column.label || column.columnId} (Zeile ${firstRow.index || 1})`,
          fieldLike: cell
        });
      }
      return missing;
    }

    return [];
  }

  function findNextMissingRequiredTarget(startIndex = activeSectionIndex, values = runValues) {
    if (!Array.isArray(runSections) || runSections.length === 0) return null;
    const total = runSections.length;
    for (let offset = 0; offset < total; offset += 1) {
      const sectionIndex = (startIndex + offset) % total;
      const section = runSections[sectionIndex];
      const missing = missingRequiredInputsForSection(section, values);
      if (missing.length === 0) continue;
      return {
        ...missing[0],
        sectionIndex,
        sectionLabel: displayRunSectionLabel(section)
      };
    }
    return null;
  }

  async function focusRunInputByKey(key) {
    const normalizedKey = String(key || '').trim();
    if (!normalizedKey) return;
    await tick();
    const root = document.querySelector('.run-main');
    if (!root) return;
    const escapedKey =
      typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
        ? CSS.escape(normalizedKey)
        : normalizedKey.replace(/["\\]/g, '\\$&');
    const nodes = root.querySelectorAll(`[data-run-key="${escapedKey}"]`);
    if (!nodes || nodes.length === 0) return;
    const node = nodes[0];
    if (node instanceof HTMLElement) {
      node.focus();
      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }

  async function jumpToNextRequiredField() {
    runError = '';
    const target = findNextMissingRequiredTarget(activeSectionIndex, runValues);
    if (!target) {
      runInfo = 'Alle Pflichtfelder sind ausgefüllt.';
      return;
    }

    runReviewExpanded = true;
    runInfo = `Pflichtfeld in "${target.sectionLabel}" geöffnet: ${target.label}`;
    if (target.sectionIndex !== activeSectionIndex) {
      activeSectionIndex = target.sectionIndex;
      runSectionRenderNonce += 1;
      scheduleRunAutosave();
      await syncRunSectionInputs();
    } else {
      runSectionRenderNonce += 1;
      await tick();
    }

    if (target.fieldLike) {
      focusRunPreview(target.fieldLike);
    }
    await focusRunInputByKey(target.inputKey);
  }

  async function syncRunSectionInputs() {
    await tick();
    if (typeof document !== 'undefined') {
      const root = document.querySelector('.run-main');
      if (root) {
        const keyed = root.querySelectorAll('[data-run-key]');
        keyed.forEach((node) => {
          if (!(node instanceof HTMLInputElement || node instanceof HTMLSelectElement || node instanceof HTMLTextAreaElement)) return;
          const key = String(node.dataset.runKey || '').trim();
          if (!key) return;
          const rawValue = runValues[key];

          if (node instanceof HTMLInputElement) {
            if (node.type === 'checkbox') {
              node.checked = rawValue === true;
              return;
            }
            if (node.type === 'radio') {
              node.checked = String(rawValue ?? '') === String(node.value ?? '');
              return;
            }
            node.value = String(rawValue ?? '');
            return;
          }

          if (node instanceof HTMLSelectElement) {
            node.value = String(rawValue ?? '');
            return;
          }

          if (node instanceof HTMLTextAreaElement) {
            node.value = String(rawValue ?? '');
            resizeRunTextarea(node);
          }
        });
      }
    }
    runSectionRenderNonce += 1;
    runValues = { ...runValues };
  }

  function moveSection(delta) {
    if (!runSections.length) return;
    const next = Math.max(0, Math.min(activeSectionIndex + delta, runSections.length - 1));
    if (next === activeSectionIndex) return;
    activeSectionIndex = next;
    runSectionRenderNonce += 1;
    const first = firstFieldInRunSection(runSections[next], runValues);
    if (first) {
      focusRunPreview(first);
    } else {
      runFocusedFieldId = '';
      renderRunPreview();
    }
    scheduleRunAutosave();
    syncRunSectionInputs();
  }

  function jumpToSection(index) {
    const next = Math.max(0, Math.min(Number(index || 0), runSections.length - 1));
    if (next === activeSectionIndex) return;
    activeSectionIndex = next;
    runSectionRenderNonce += 1;
    const first = firstFieldInRunSection(runSections[next], runValues);
    if (first) {
      focusRunPreview(first);
    } else {
      runFocusedFieldId = '';
      renderRunPreview();
    }
    scheduleRunAutosave();
    syncRunSectionInputs();
  }

  function inputValue(key, type = 'text', values = runValues) {
    const value = values[String(key || '')];
    if (type === 'checkbox') return value === true;
    return String(value || '');
  }

  function sectionMissingLabel(section, values = runValues) {
    const missing = runSectionMissingCount(section, values);
    if (missing === 0) return 'OK';
    return `${missing} Pflicht offen`;
  }

  function downloadFile(fileBytes, fileName) {
    const blob = fileBytes instanceof Blob ? fileBytes : new Blob([fileBytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  function safeFileName(value) {
    const dashSeparatorToken = 'BTBDASHSEPTOKEN';
    const normalized = String(value || 'bautagebuch')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s-\s/g, dashSeparatorToken);
    const cleaned = normalized
      .replace(/[^a-zA-Z0-9_.\- ]+/g, '_')
      .replace(/ +/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '')
      .replace(new RegExp(dashSeparatorToken, 'g'), ' - ');
    return cleaned || 'bautagebuch';
  }

  async function exportRunPdf({ photoDocExportMode = RUN_FINISH_EXPORT_MODE_MERGED } = {}) {
    runError = '';
    runInfo = '';
    runReviewExpanded = true;
    if (!activeRun || !runTemplate || !runModel) return false;

    await flushRunAutosave();
    if (totalMissingRequired > 0) {
      runError = `Export blockiert: ${totalMissingRequired} Pflichtfelder fehlen.`;
      return false;
    }

    try {
      const baseBytes = await buildFinalPdfBytes({
        templateBlob: runTemplate.pdfBlob,
        setupModel: runModel,
        runValues
      });
      const photoEntries = photoDocExportEntries(runPhotoDoc);
      const exportMode = normalizeRunFinishExportMode(photoDocExportMode);
      const baseFileName = safeFileName(activeRun.title);
      let exportedFileName = '';
      let exportInfo = 'PDF exportiert.';

      if (exportMode === RUN_FINISH_EXPORT_MODE_BTB) {
        exportedFileName = `${baseFileName}.pdf`;
        downloadFile(baseBytes, exportedFileName);
        exportInfo = 'BTB-PDF exportiert.';
      } else if (exportMode === RUN_FINISH_EXPORT_MODE_PHOTO) {
        const photoDocFileName = `${baseFileName}_Fotodoku.pdf`;
        const photoDocBytes = await buildPhotoDocPdfBytes({
          title: `Fotodokumentation - ${String(activeRun.title || 'Bautagebuch').trim() || 'Bautagebuch'}`,
          entries: photoEntries
        });
        exportedFileName = photoDocFileName;
        downloadFile(photoDocBytes, exportedFileName);
        exportInfo =
          photoEntries.length === 0
            ? 'Fotodoku-PDF exportiert (ohne Bilder).'
            : 'Fotodoku-PDF exportiert.';
      } else {
        const merged = await mergeBtbWithPhotoDoc({
          btbPdfBytes: baseBytes,
          photoDocEnabled: photoEntries.length > 0,
          photoEntries
        });
        exportedFileName = `${baseFileName}.pdf`;
        downloadFile(merged.bytes, exportedFileName);
        const exportHint = merged.enabledWithoutImages
          ? 'Hinweis: Fotodoku enthält keine Bilder.'
          : '';
        exportInfo = exportHint ? `PDF exportiert. ${exportHint}` : 'PDF exportiert.';
      }

      const nextRun = await updateRun(activeRun.runId, {
        values: runValuesWithPhotoDocChoice(runValues, runPhotoDoc.enabled),
        photoDoc: cloneRunPhotoDoc(runPhotoDoc),
        sectionIndex: activeSectionIndex,
        status: 'completed',
        completedAt: new Date().toISOString()
      });
      if (nextRun) activeRun = nextRun;
      await addExportRecord({ runId: activeRun.runId, fileName: exportedFileName });
      runExports = await listExports(activeRun.runId);
      runInfo = exportInfo;
      runAutosave = `Gespeichert ${nowLabel()}`;
      await refreshHomeData();
      return true;
    } catch (error) {
      runError = error?.message || 'PDF-Export fehlgeschlagen.';
      return false;
    }
  }

  function openRunFinishDialog() {
    runError = '';
    runInfo = '';
    runFinishExportMode = RUN_FINISH_EXPORT_MODE_MERGED;
    runFinishDialogOpen = true;
  }

  function closeRunFinishDialog() {
    runFinishDialogOpen = false;
    runFinishExportMode = RUN_FINISH_EXPORT_MODE_MERGED;
  }

  async function finishRunWithPdf() {
    const ok = await exportRunPdf({ photoDocExportMode: runFinishExportMode });
    if (ok) {
      runFinishDialogOpen = false;
      runFinishExportMode = RUN_FINISH_EXPORT_MODE_MERGED;
    }
  }

  async function finishRunToStart() {
    runFinishDialogOpen = false;
    runFinishExportMode = RUN_FINISH_EXPORT_MODE_MERGED;
    await leaveRunToHome();
  }

  async function leaveRunToHome() {
    await flushRunAutosave();
    view = 'home';
    runTemplate = null;
    runModel = null;
    activeRun = null;
    runValues = {};
    activeSectionIndex = 0;
    runExports = [];
    runReviewExpanded = false;
    runPreviewDoc = null;
    runPreviewPageCount = 1;
    runPreviewDocBusy = false;
    runPreviewTarget = { page: 1, rect: null };
    runFocusedFieldId = '';
    runPhotoDoc = createEmptyRunPhotoDoc();
    photoDocEditorOpen = false;
    clearPhotoDocObjectUrls();
    runFinishDialogOpen = false;
    runFinishExportMode = RUN_FINISH_EXPORT_MODE_MERGED;
    await refreshHomeData();
  }
</script>

<div class="page">
  <header class="hero">
    <div>
      <p class="eyebrow">BÜW-Toolbox</p>
      <h1>Bautagebuch</h1>
      <p class="sub">
        Speziell für die feste Vorlage-eBTB gebaut: kein Template-Wechsel, klare Schrittführung und direkter PDF-Export.
      </p>
    </div>
    {#if view === 'home'}
      <a class="toolbox-link" href="/buew-toolbox/">Zur Toolbox</a>
    {/if}
  </header>

  {#if view === 'home'}
    {#if homeInfo}
      <div class="notice ok">{homeInfo}</div>
    {/if}
    {#if homeError}
      <div class="notice error">{homeError}</div>
    {/if}

    <section class="panel">
      <h2>Neues BTB</h2>
      {#if templates.length === 0}
        <p class="muted">Startbereich wird vorbereitet ...</p>
      {:else}
        <div class="template-list">
          <article class="template-card template-card--new-run">
            <div>
              <p class="meta home-new-run-hint">BTB-Name vergeben und direkt starten.</p>
              <label class="field home-run-name-field">
                <span>Name für neues BTB *</span>
                <input
                  value={newRunNameInput}
                  placeholder="z. B. Strecke Nord"
                  on:input={(event) => {
                    newRunNameInput = event.currentTarget.value;
                    homeError = '';
                  }}
                />
                <small class="meta">Namenskonvention: {buildRunTitleByConvention(newRunNameInput)}</small>
              </label>
              <div class="row start">
                <button
                  type="button"
                  class="primary"
                  on:click={() => startNewRun(templates[0].templateId)}
                  disabled={templates[0].status !== 'ready' || !normalizeRunNameInput(newRunNameInput)}
                >
                  Neues BTB starten
                </button>
              </div>
              {#if templates[0].status !== 'ready'}
                <small class="meta">Vorlage wird noch vorbereitet.</small>
              {/if}
            </div>
          </article>
        </div>
        <div class="row start home-setup-actions">
          <button type="button" on:click={() => openSetup(templates[0].templateId)}>Setup öffnen</button>
        </div>
      {/if}
    </section>

    <section class="panel">
      <h2>BTB</h2>
      {#if runs.length === 0}
        <p class="muted">Noch keine BTB vorhanden.</p>
      {:else}
        <div class="row between home-run-select-actions">
          <button type="button" on:click={toggleHomeSelectionMode}>
            {homeSelectionMode ? 'Auswahl beenden' : 'Auswählen'}
          </button>
          {#if homeSelectionMode}
            <div class="row home-run-selection-summary">
              <span class="meta">Ausgewählt: <strong>{selectedHomeRunCount}</strong></span>
              <button
                type="button"
                on:click={selectAllHomeRuns}
                disabled={selectableHomeRunIds.length === 0 || allHomeRunsSelected}
              >
                Alle auswählen
              </button>
              <button
                type="button"
                class="danger"
                on:click={deleteSelectedHomeRuns}
                disabled={homeRunDeleteBusy || selectedHomeRunCount === 0}
              >
                {homeRunDeleteBusy ? 'Löscht...' : 'Ausgewählte BTB löschen'}
              </button>
            </div>
          {/if}
        </div>
        <div class="home-runs-scroll">
          <div class="home-week-groups">
            {#each homeRunWeekGroups as weekGroup (weekGroup.weekKey)}
              {@const weekExpanded = homeExpandedWeekKeySet.has(weekGroup.weekKey)}
              <section class="home-week-group">
                <button
                  type="button"
                  class="home-week-toggle"
                  aria-expanded={weekExpanded}
                  on:click={() => toggleHomeWeekGroup(weekGroup.weekKey)}
                >
                  <span class="home-week-toggle-main">
                    <strong>{weekGroup.weekLabel}</strong>
                    {#if weekGroup.weekYear != null}
                      <small>{weekGroup.weekYear}</small>
                    {/if}
                  </span>
                  <span class="home-week-toggle-side">
                    <span class="meta">{weekGroup.runs.length} BTB</span>
                    <span class="home-week-chevron">{weekExpanded ? 'v' : '>'}</span>
                  </span>
                </button>

                {#if weekExpanded}
                  <div class="home-week-body">
                    <div class="template-list">
                      {#each weekGroup.runs as run}
                        {@const runId = String(run?.runId || '').trim()}
                        {@const runSelected = homeSelectionMode && selectedHomeRunIdSet.has(runId)}
                        {@const runPulsing = homeRunSelectionPulseIdSet.has(runId)}
                        <article
                          class="template-card"
                          class:template-card--home-selectable={homeSelectionMode}
                          class:selected-run={runSelected}
                          class:selected-run-pulse={runPulsing}
                          role={homeSelectionMode ? 'button' : undefined}
                          aria-pressed={homeSelectionMode ? runSelected : undefined}
                          on:click={(event) => handleHomeRunCardClick(event, runId)}
                          on:keydown={(event) => handleHomeRunCardKeydown(event, runId)}
                        >
                          <div>
                            <h3>{run.title}</h3>
                            <div class="meta">Status: {run.status === 'completed' ? 'Abgeschlossen' : 'In Arbeit'}</div>
                            <div class="meta">Zuletzt geändert: {new Date(run.updatedAt).toLocaleString('de-DE')}</div>
                            {#if runSelected}
                              <span class="home-run-selection-pill">Ausgewählt</span>
                            {/if}
                          </div>
                          <div class="row">
                            <button type="button" class="primary" on:click|stopPropagation={() => openRun(run.runId)}>Öffnen</button>
                            <button type="button" on:click|stopPropagation={() => renameRunEntry(run, { scope: 'home' })}>Umbenennen</button>
                          </div>
                        </article>
                      {/each}
                    </div>
                  </div>
                {/if}
              </section>
            {/each}
          </div>
        </div>
      {/if}
    </section>
  {/if}

  {#if view === 'setup' && setupModelDraft}
    <section class="panel">
      <div class="title-row">
        <div>
          <h2>Interaktives Setup</h2>
          <p class="meta">{setupTemplate?.templateName}</p>
        </div>
        <div class="row">
          <button type="button" on:click={saveSetupDraft} disabled={setupSaving}>Zwischenspeichern</button>
          <button type="button" class="primary" on:click={finishSetup} disabled={setupSaving}>Setup abschließen</button>
          <button type="button" on:click={leaveSetupToHome} disabled={setupSaving}>Zurück</button>
        </div>
      </div>

      {#if setupInfo}
        <div class="notice ok">{setupInfo}</div>
      {/if}
      {#if setupError}
        <div class="notice error">{setupError}</div>
      {/if}
      {#if setupValidationErrors.length > 0}
        <div class="notice warn">
          {setupValidationErrors.length} Validierungsproblem(e): {setupValidationErrors[0]}
        </div>
      {/if}

      <div class="setup-grid">
        <div class="panel-soft setup-workbench">
          <div class="setup-nav">
            <div class="setup-nav-head">
              <h3>Gruppen</h3>
              <button type="button" on:click={addSingleSection}>+ Gruppe</button>
            </div>
            {#if setupSingleSections.length === 0}
              <p class="muted">Keine Gruppen vorhanden.</p>
            {:else}
              <div class="setup-nav-list">
                {#each setupSingleSections as section (section.sectionId)}
                  <button
                    type="button"
                    class={`setup-nav-item ${setupMode === 'single' && String(section.sectionId) === String(setupActiveSingleSectionId) ? 'active' : ''}`}
                    on:click={() => selectSetupSingleSection(section.sectionId)}
                  >
                    <span>{displaySingleSectionLabel(section)}</span>
                    <small>{(section.fields || []).length} Felder</small>
                  </button>
                {/each}
              </div>
            {/if}

            <h3>Tabellen</h3>
            {#if setupTableSections.length === 0}
              <p class="muted">Keine Tabellen vorhanden.</p>
            {:else}
              <div class="setup-nav-list">
                {#each setupTableSections as table (table.tableId)}
                  <button
                    type="button"
                    class={`setup-nav-item ${setupMode === 'table' && String(table.tableId) === String(setupActiveTableId) ? 'active' : ''}`}
                    on:click={() => selectSetupTable(table.tableId)}
                  >
                    <span>{displayTableSectionLabel(table)}</span>
                    <small>{(table.rows || []).length} Zeilen · {(table.columns || []).length} Spalten</small>
                  </button>
                {/each}
              </div>
            {/if}
          </div>

          <div class="setup-editor">
            {#if setupMode === 'single' && activeSetupSingleSection}
              {#key `${activeSetupSingleSection.sectionId}:${setupSectionRenderNonce}`}
                <div class="section-card">
                  <label class="field line-main">
                    <span>Gruppenname</span>
                    <input
                      value={activeSetupSingleSection.label}
                      on:input={(event) => updateSingleSectionLabel(activeSetupSingleSection.sectionId, event.currentTarget.value)}
                    />
                  </label>

                  {#if (activeSetupSingleSection.fields || []).length === 0}
                    <p class="muted">Diese Gruppe enthält noch keine Felder.</p>
                  {/if}
                  {#each activeSetupSingleSection.fields || [] as field (field.fieldId)}
                    <div
                      class="line line-setup setup-field-card"
                      class:drag-source={setupDragFieldId === field.fieldId}
                      class:drag-target-before={
                        setupDragFieldId &&
                        setupDragFieldId !== field.fieldId &&
                        setupDropFieldId === field.fieldId &&
                        setupDropPosition === 'before'
                      }
                      class:drag-target-after={
                        setupDragFieldId &&
                        setupDragFieldId !== field.fieldId &&
                        setupDropFieldId === field.fieldId &&
                        setupDropPosition === 'after'
                      }
                      data-setup-field-id={field.fieldId}
                      role="group"
                      on:mouseenter={() => focusSetupPreview(field)}
                    >
                      <button
                        type="button"
                        class="field-drag-handle"
                        aria-label={`Feld ${field.label || field.fieldName || field.fieldId} verschieben`}
                        on:pointerdown={(event) => startSetupFieldDrag(event, field.fieldId)}
                      >
                        ...
                      </button>
                      <div class="line-main line-main-stacked">
                        <label class="field">
                          <span>Feldbezeichnung ({field.fieldName})</span>
                          <input
                            name={`setup_label_${activeSetupSingleSection.sectionId}_${field.fieldId}`}
                            autocomplete="off"
                            value={field.label}
                            on:input={(event) =>
                              updateSingleField(activeSetupSingleSection.sectionId, field.fieldId, { label: event.currentTarget.value })}
                            on:focus={() => focusSetupPreview(field)}
                          />
                        </label>
                        <div class="line-controls">
                          <div class="group-select-card">
                            <p class="group-select-title">Gruppenzuordnung für dieses Feld</p>
                            <label class="field group-select">
                              <span>Zielgruppe</span>
                              <select
                                name={`setup_group_${activeSetupSingleSection.sectionId}_${field.fieldId}`}
                                autocomplete="off"
                                value={activeSetupSingleSection.sectionId}
                                on:focus={() => focusSetupPreview(field)}
                                on:change={(event) =>
                                  moveSingleFieldToSection(activeSetupSingleSection.sectionId, field.fieldId, event.currentTarget.value)}
                              >
                                {#each setupSingleSections as singleSection (singleSection.sectionId)}
                                  <option value={singleSection.sectionId}>{singleSection.label}</option>
                                {/each}
                              </select>
                            </label>
                          </div>
                          <div class="line-flags">
                            <label class="check">
                              <input
                                type="checkbox"
                                checked={field.required === true}
                                on:focus={() => focusSetupPreview(field)}
                                on:change={(event) =>
                                  updateSingleField(activeSetupSingleSection.sectionId, field.fieldId, { required: event.currentTarget.checked })}
                              />
                              Pflicht
                            </label>
                            <label class="check">
                              <input
                                type="checkbox"
                                checked={field.skipped === true}
                                on:focus={() => focusSetupPreview(field)}
                                on:change={(event) =>
                                  updateSingleField(activeSetupSingleSection.sectionId, field.fieldId, { skipped: event.currentTarget.checked })}
                              />
                              Skip
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  {/each}
                  <div class="row start setup-section-actions">
                    <button
                      type="button"
                      class="danger"
                      on:click={() => deleteSingleSection(activeSetupSingleSection.sectionId)}
                      disabled={setupSingleSections.length <= 1}
                    >
                      Gruppe löschen
                    </button>
                  </div>
                </div>
              {/key}
            {:else if setupMode === 'table' && activeSetupTableSection}
              {#key `${activeSetupTableSection.tableId}:${setupSectionRenderNonce}`}
                <div class="section-card">
                  <label class="field">
                    <span>Tabellenname</span>
                    <input
                      value={activeSetupTableSection.label}
                      on:input={(event) => updateTableLabel(activeSetupTableSection.tableId, event.currentTarget.value)}
                    />
                  </label>

                  <div class="table-config">
                    <h4>Spalten</h4>
                    {#each activeSetupTableSection.columns as column (column.columnId)}
                      <div class="line">
                        <label class="field line-main">
                          <span>{column.columnId}</span>
                          <input
                            value={column.label}
                            on:focus={() => focusTableColumnPreview(activeSetupTableSection, column.columnId)}
                            on:input={(event) =>
                              updateTableColumn(activeSetupTableSection.tableId, column.columnId, { label: event.currentTarget.value })}
                          />
                        </label>
                        <div class="line-flags line-flags-inline">
                          <label class="check">
                            <input
                              type="checkbox"
                              checked={column.required === true}
                              on:focus={() => focusTableColumnPreview(activeSetupTableSection, column.columnId)}
                              on:change={(event) =>
                                updateTableColumn(activeSetupTableSection.tableId, column.columnId, { required: event.currentTarget.checked })}
                            />
                            Pflicht
                          </label>
                          <label class="check">
                            <input
                              type="checkbox"
                              checked={column.skipped === true}
                              on:focus={() => focusTableColumnPreview(activeSetupTableSection, column.columnId)}
                              on:change={(event) =>
                                updateTableColumn(activeSetupTableSection.tableId, column.columnId, { skipped: event.currentTarget.checked })}
                            />
                            Skip
                          </label>
                        </div>
                      </div>
                    {/each}
                  </div>

                </div>
              {/key}
            {/if}
          </div>
        </div>

        <div class="panel-soft setup-preview-pane">
          <h3>PDF-Vorschau</h3>
          <canvas bind:this={setupCanvas}></canvas>
          <div class="setup-preview-legend">
            <p class="meta">Seite {setupPreviewTarget?.page || 1} · {setupPreviewPageMarkers.length} markierte Felder</p>
            <p class="meta">Grau: erkannt · Blau: aktuelle Gruppe/Tabelle · Grün: aktives Feld</p>
            {#if setupFocusedFieldLabel}
              <p class="meta"><strong>Aktiv:</strong> {setupFocusedFieldLabel}</p>
            {/if}
          </div>
        </div>
      </div>
    </section>
  {/if}

  {#if view === 'run' && activeRun && runModel}
    <section class="panel">
      <div class="title-row">
        <div>
          <h2>{activeRun.title}</h2>
          <p class="meta">{runTemplate?.templateName}</p>
        </div>
        <div class="row">
          <button type="button" on:click={() => renameRunEntry(activeRun, { scope: 'run' })}>Umbenennen</button>
          <button type="button" on:click={leaveRunToHome}>Zur Übersicht</button>
        </div>
      </div>

      {#if runInfo}
        <div class="notice ok">{runInfo}</div>
      {/if}
      {#if runError}
        <div class="notice error">{runError}</div>
      {/if}

      <div class="run-layout">
        <aside class="run-nav">
          {#each runSections as section, index}
            <button
              class={`nav-item ${index === activeSectionIndex ? 'active' : ''}`}
              type="button"
              on:click={() => jumpToSection(index)}
            >
              <span class={`dot ${runSectionProgress(section, runValues)}`}></span>
              <span class="nav-main">
                <strong>{displayRunSectionLabel(section)}</strong>
                <small>{sectionMissingLabel(section, runValues)}</small>
              </span>
            </button>
          {/each}
        </aside>

        <div class="run-workbench">
          <div class="run-main">
            {#if activeSection}
              {#key `${activeSection.sectionId}:${runSectionRenderNonce}`}
                {#if activeSection.kind === 'single'}
                  <h3>{displayRunSectionLabel(activeSection)}</h3>
                  {#if isWeatherSingleSection(activeSection)}
                    <div class="row start weather-sync-actions">
                      <button type="button" on:click={() => refreshWeatherValues(activeSection)} disabled={weatherSyncBusy}>
                        {weatherSyncBusy ? 'Werte werden aktualisiert…' : 'Werte aktualisieren'}
                      </button>
                      <span class="meta">Online-Wetter für den aktuellen Standort</span>
                    </div>
                  {/if}
                  <div class="grid-two">
                    {#if gewerkFieldsInSection(activeSection).length > 0}
                      <label class="field" style:order={isHeaderSingleSection(activeSection) ? 50 : null}>
                        <span>Gewerk *</span>
                        <select
                          class:input-invalid={isGewerkSelectionRequiredMissing(activeSection, runValues)}
                          data-run-key={gewerkSelectionInputKey(activeSection)}
                          value={selectedGewerkFieldName(activeSection, runValues)}
                          on:focus={() => {
                            const first = firstGewerkField(activeSection);
                            if (first) focusRunPreview(first);
                          }}
                          on:change={(event) => setGewerkSelection(activeSection, event.currentTarget.value)}
                        >
                          <option value="">Bitte wählen</option>
                          {#each gewerkFieldsInSection(activeSection) as gewerkField (gewerkField.fieldId)}
                            <option value={gewerkField.fieldName}>{gewerkField.label}</option>
                          {/each}
                        </select>
                        {#if isGewerkSelectionRequiredMissing(activeSection, runValues)}
                          <small class="inline-error">Pflichtfeld fehlt</small>
                        {/if}
                      </label>
                    {/if}
                    {#if shiftFieldsInSection(activeSection).length > 0}
                      {@const shiftRequiredMissing = isShiftSelectionRequiredMissing(activeSection, runValues)}
                      <div class="field shift-stack" style:order={isHeaderSingleSection(activeSection) ? 30 : null}>
                        <span>Schicht *</span>
                        <div class="shift-options">
                          {#each shiftFieldsInSection(activeSection) as field (field.fieldId)}
                            {@const key = inputKeyForField(field)}
                            <div class="shift-row">
                              <label class="check shift-option">
                                <input
                                  type="checkbox"
                                  class:input-invalid={shiftRequiredMissing}
                                  data-run-key={key}
                                  checked={inputValue(key, field.type, runValues)}
                                  on:focus={() => focusRunPreview(field)}
                                  on:change={(event) => setShiftSelection(activeSection, field, event.currentTarget.checked)}
                                />
                                <span>{field.label}</span>
                              </label>
                            </div>
                          {/each}
                        </div>
                        {#if shiftRequiredMissing}
                          <small class="inline-error shift-inline-error">Bitte eine Schicht auswählen</small>
                        {/if}
                      </div>
                    {/if}
                    {#each activeSection.fields as field (field.fieldId)}
                      {#if !isGewerkField(field) && !isShiftField(field)}
                        {@const key = inputKeyForField(field)}
                        {@const fieldOrder = isHeaderSingleSection(activeSection) ? headerFieldDisplayOrder(field) : null}
                        {@const singleMissing = isSingleFieldRequiredMissing(field, runValues)}
                        {#if field.type === 'text'}
                          <label class="field" style:order={fieldOrder}>
                            <span>{field.label}{field.required ? ' *' : ''}</span>
                            <input
                              class="run-text-input"
                              class:run-text-input--compact={isCompactTextField(field)}
                              class:input-invalid={singleMissing}
                              data-run-key={key}
                              name={`run_${activeSection.sectionId}_${field.fieldId}`}
                              autocomplete="off"
                              value={inputValue(key, field.type, runValues)}
                              on:focus={() => focusRunPreview(field)}
                              on:input={(event) => setRunValue(key, event.currentTarget.value)}
                            />
                            {#if singleMissing}
                              <small class="inline-error">Pflichtfeld fehlt</small>
                            {/if}
                          </label>
                        {:else if field.type === 'checkbox'}
                          <div class="field" style:order={fieldOrder}>
                            <label class="check box">
                              <input
                                type="checkbox"
                                class:input-invalid={singleMissing}
                                data-run-key={key}
                                checked={inputValue(key, field.type, runValues)}
                                on:focus={() => focusRunPreview(field)}
                                on:change={(event) => setRunValue(key, event.currentTarget.checked)}
                              />
                              {field.label}{field.required ? ' *' : ''}
                            </label>
                            {#if singleMissing}
                              <small class="inline-error">Pflichtfeld fehlt</small>
                            {/if}
                          </div>
                        {:else if field.type === 'dropdown'}
                          <label class="field" style:order={fieldOrder}>
                            <span>{field.label}{field.required ? ' *' : ''}</span>
                            <select
                              class:input-invalid={singleMissing}
                              data-run-key={key}
                              value={inputValue(key, field.type, runValues)}
                              on:focus={() => focusRunPreview(field)}
                              on:change={(event) => setRunValue(key, event.currentTarget.value)}
                            >
                              <option value="">Bitte wählen</option>
                              {#each field.options || [] as option}
                                <option value={option}>{option}</option>
                              {/each}
                            </select>
                            {#if singleMissing}
                              <small class="inline-error">Pflichtfeld fehlt</small>
                            {/if}
                          </label>
                        {:else if field.type === 'radio'}
                          <div class="field" style:order={fieldOrder}>
                            <fieldset class="field radios" class:input-invalid={singleMissing}>
                              <legend>{field.label}{field.required ? ' *' : ''}</legend>
                              {#each field.options || [] as option}
                                <label class="check">
                                  <input
                                    type="radio"
                                    data-run-key={key}
                                    name={`radio_${activeSection.sectionId}_${field.fieldId}`}
                                    value={option}
                                    checked={inputValue(key, field.type, runValues) === option}
                                    on:focus={() => focusRunPreview(field)}
                                    on:change={(event) => setRunValue(key, event.currentTarget.value)}
                                  />
                                  {option}
                                </label>
                              {/each}
                            </fieldset>
                            {#if singleMissing}
                              <small class="inline-error">Pflichtfeld fehlt</small>
                            {/if}
                          </div>
                        {/if}
                      {/if}
                    {/each}
                  </div>
                {/if}

                {#if activeSection.kind === 'table'}
                  <h3>{displayRunSectionLabel(activeSection)}</h3>
                  <div class="run-table-rows">
                    {#each activeTableVisibleRows as row (row.rowId)}
                      <article class="run-row-card" class:run-row-card--detail={isLeistungsblockTable(activeSection)}>
                        {#if !isLeistungsblockTable(activeSection)}
                          <div class="run-row-head">
                            <strong>Zeile {row.index}</strong>
                          </div>
                        {/if}
                        <div
                          class="run-row-fields"
                          class:run-row-fields--detail={isLeistungsblockTable(activeSection)}
                          class:run-row-fields--personal={isMainPersonalTable(activeSection)}
                          class:run-row-fields--default={!isLeistungsblockTable(activeSection) && !isMainPersonalTable(activeSection)}
                        >
                          {#each activeSection.columns as column (column.columnId)}
                            {@const cell = (row.cells || []).find((entry) => String(entry.columnId) === String(column.columnId))}
                            {#if cell}
                              {@const key = inputKeyForCell(cell)}
                              {@const cellMissing = isTableCellRequiredMissing(activeSection, row, column, cell, runValues)}
                              {@const cellMultiline = isRunCellMultiline(activeSection, column, cell)}
                              <div
                                class="field run-cell-field"
                                class:run-cell-field--detail-main={isLeistungsblockPrimaryTextColumn(activeSection, column, cell)}
                                class:run-cell-field--detail-secondary={isLeistungsblockSecondaryTextColumn(activeSection, column, cell)}
                                class:run-cell-field--compact={isLeistungsblockCompactColumn(activeSection, column, cell)}
                                class:run-cell-field--personal-company={isMainPersonalCompanyColumn(activeSection, column, cell)}
                                class:run-cell-field--personal-start-end={isMainPersonalStartEndColumn(activeSection, column, cell)}
                                class:run-cell-field--time={isMainPersonalTimeCell(activeSection, column, cell)}
                              >
                                <span
                                  class="run-cell-label"
                                  class:run-cell-label--multiline={isLeistungsblockPrimaryTextColumn(activeSection, column, cell)}
                                  >{displayTableColumnLabel(activeSection, column)}{column.required ? ' *' : ''}</span
                                >
                                {#if cell.type === 'text'}
                                  {#if cellMultiline}
                                    <textarea
                                      class="run-textarea-input"
                                      class:run-textarea-input--detail-main={isLeistungsblockPrimaryTextColumn(activeSection, column, cell)}
                                      class:run-textarea-input--detail-secondary={isLeistungsblockSecondaryTextColumn(activeSection, column, cell)}
                                      class:input-invalid={cellMissing}
                                      style={`--run-text-size:${runTextareaFontSize(inputValue(key, cell.type, runValues), cell)}px`}
                                      name={`run_${activeSection.tableId}_${cell.cellId}`}
                                      autocomplete="off"
                                      data-run-key={key}
                                      rows={isLeistungsblockPrimaryTextColumn(activeSection, column, cell) ? 4 : 2}
                                      value={inputValue(key, cell.type, runValues)}
                                      on:focus={(event) => {
                                        focusRunPreview(cell);
                                        resizeRunTextarea(event.currentTarget);
                                      }}
                                      on:input={(event) => handleRunTextareaInput(key, event.currentTarget)}
                                    ></textarea>
                                  {:else}
                                    <input
                                      class="run-text-input"
                                      class:run-text-input--compact-table={isLeistungsblockCompactColumn(activeSection, column, cell)}
                                      class:input-invalid={cellMissing}
                                      name={`run_${activeSection.tableId}_${cell.cellId}`}
                                      autocomplete="off"
                                      placeholder={isMainPersonalTimeCell(activeSection, column, cell) ? 'HH:MM' : ''}
                                      inputmode={isMainPersonalTimeCell(activeSection, column, cell) ? 'numeric' : undefined}
                                      data-run-key={key}
                                      value={inputValue(key, cell.type, runValues)}
                                      on:focus={() => focusRunPreview(cell)}
                                      on:input={(event) => setRunValue(key, event.currentTarget.value)}
                                      on:blur={(event) =>
                                        finalizeRunTableTextInput(activeSection, column, cell, key, event.currentTarget.value)}
                                    />
                                  {/if}
                                  {#if cellMissing}
                                    <small class="inline-error">Pflichtfeld fehlt</small>
                                  {/if}
                                {:else if cell.type === 'checkbox'}
                                  <label class="check">
                                    <input
                                      type="checkbox"
                                      class:input-invalid={cellMissing}
                                      data-run-key={key}
                                      checked={inputValue(key, cell.type, runValues)}
                                      on:focus={() => focusRunPreview(cell)}
                                      on:change={(event) => setRunValue(key, event.currentTarget.checked)}
                                    />
                                    Aktiv
                                  </label>
                                  {#if cellMissing}
                                    <small class="inline-error">Pflichtfeld fehlt</small>
                                  {/if}
                                {:else if cell.type === 'dropdown'}
                                  <select
                                    class:input-invalid={cellMissing}
                                    name={`run_${activeSection.tableId}_${cell.cellId}`}
                                    autocomplete="off"
                                    data-run-key={key}
                                    value={inputValue(key, cell.type, runValues)}
                                    on:focus={() => focusRunPreview(cell)}
                                    on:change={(event) => setRunValue(key, event.currentTarget.value)}
                                  >
                                    <option value="">Bitte wählen</option>
                                    {#each cell.options || setupFields.find((entry) => entry.fieldId === cell.fieldId)?.options || [] as option}
                                      <option value={option}>{option}</option>
                                    {/each}
                                  </select>
                                  {#if cellMissing}
                                    <small class="inline-error">Pflichtfeld fehlt</small>
                                  {/if}
                                {:else if cell.type === 'radio'}
                                  <div class="radio-list" class:input-invalid={cellMissing}>
                                    {#each cell.options || setupFields.find((entry) => entry.fieldId === cell.fieldId)?.options || [] as option}
                                      <label class="check">
                                        <input
                                          type="radio"
                                          data-run-key={key}
                                          name={`radio_${activeSection.tableId}_${cell.cellId}`}
                                          value={option}
                                          checked={inputValue(key, cell.type, runValues) === option}
                                          on:focus={() => focusRunPreview(cell)}
                                          on:change={(event) => setRunValue(key, event.currentTarget.value)}
                                        />
                                        {option}
                                      </label>
                                    {/each}
                                  </div>
                                  {#if cellMissing}
                                    <small class="inline-error">Pflichtfeld fehlt</small>
                                  {/if}
                                {/if}
                              </div>
                            {/if}
                          {/each}
                        </div>
                      </article>
                    {/each}
                  </div>
                  {#if activeTableRowLimit > 1}
                    <div class="row start table-rows-actions">
                      <button
                        type="button"
                        on:click={() => addRunTableRow(activeSection)}
                        disabled={activeTableVisibleCount >= activeTableRowLimit}
                      >
                        Weitere Zeile hinzufügen
                      </button>
                      <span class="meta">{activeTableVisibleCount}/{activeTableRowLimit} Zeilen sichtbar</span>
                    </div>
                  {/if}
                {/if}

                {#if isPhotoDocSection(activeSection)}
                  <h3>{displayRunSectionLabel(activeSection)}</h3>
                  <div class="photo-doc-step">
                    <fieldset class="radios photo-doc-choice" class:input-invalid={isPhotoDocRequiredMissing()}>
                      <legend>Fotodoku anlegen *</legend>
                      <label class="check">
                        <input
                          type="radio"
                          name="photo_doc_enabled"
                          data-run-key={PHOTO_DOC_ENABLED_RUN_KEY}
                          value="yes"
                          checked={photoDocChoiceValue(runPhotoDoc) === 'yes'}
                          on:change={(event) => setRunPhotoDocChoice(event.currentTarget.value)}
                        />
                        Ja
                      </label>
                      <label class="check">
                        <input
                          type="radio"
                          name="photo_doc_enabled"
                          data-run-key={PHOTO_DOC_ENABLED_RUN_KEY}
                          value="no"
                          checked={photoDocChoiceValue(runPhotoDoc) === 'no'}
                          on:change={(event) => setRunPhotoDocChoice(event.currentTarget.value)}
                        />
                        Nein
                      </label>
                    </fieldset>
                    {#if isPhotoDocRequiredMissing()}
                      <small class="inline-error">Bitte Ja oder Nein auswählen</small>
                    {/if}

                    {#if runPhotoDoc.enabled === true}
                      <div class="row start photo-doc-actions">
                        <button type="button" class="primary" on:click={() => (photoDocEditorOpen = !photoDocEditorOpen)}>
                          {photoDocEditorOpen ? 'Fotodoku schließen' : 'Fotodoku öffnen'}
                        </button>
                        <span class="meta">{runPhotoDoc.entries.length} Bild(er)</span>
                      </div>

                      {#if photoDocEditorOpen}
                        <div class="photo-doc-editor">
                          <div class="row start photo-doc-toolbar">
                            <label class="button-like">
                              Bild hinzufügen
                              <input type="file" accept="image/*" on:change={handlePhotoDocAddInput} />
                            </label>
                            <button type="button" on:click={savePhotoDocEditor}>Speichern</button>
                            <button type="button" on:click={() => (photoDocEditorOpen = false)}>Fertig</button>
                          </div>

                          {#if runPhotoDoc.entries.length === 0}
                            <p class="muted">Noch keine Bilder vorhanden.</p>
                          {:else}
                            <div class="photo-doc-list">
                              {#each runPhotoDoc.entries as entry (entry.id)}
                                <article class="photo-doc-entry">
                                  <div class="photo-doc-thumb-wrap">
                                    <img
                                      class="photo-doc-thumb"
                                      src={photoDocEntryObjectUrl(entry)}
                                      alt="Fotodoku Eintrag"
                                      loading="lazy"
                                    />
                                  </div>
                                  <div class="photo-doc-meta">
                                    <div class="row start photo-doc-entry-actions">
                                      <label class="button-like">
                                        Bearbeiten
                                        <input type="file" accept="image/*" on:change={(event) => handlePhotoDocReplaceInput(event, entry.id)} />
                                      </label>
                                      <button type="button" class="danger" on:click={() => deletePhotoDocEntry(entry.id)}>
                                        Löschen
                                      </button>
                                    </div>
                                  </div>
                                </article>
                              {/each}
                            </div>
                          {/if}
                        </div>
                      {/if}

                      {#if runPhotoDoc.entries.length === 0}
                        <p class="meta photo-doc-empty-hint">
                          Aktiviert ohne Bilder: Export läuft weiter, aber ohne Fotodoku-Seiten.
                        </p>
                      {/if}
                    {:else if runPhotoDoc.enabled === false}
                      <p class="muted">Fotodokumentation ist deaktiviert. Vorhandene Bilder bleiben gespeichert.</p>
                    {/if}
                  </div>
                {/if}
              {/key}
            {/if}

            <div class="row end">
              <button type="button" on:click={() => moveSection(-1)} disabled={activeSectionIndex === 0}>Zurück</button>
              {#if runSections.length > 0 && activeSectionIndex >= runSections.length - 1}
                <button
                  type="button"
                  class="primary"
                  on:click={openRunFinishDialog}
                  disabled={runSections.length === 0 || totalMissingRequired > 0}
                >
                  Abschließen
                </button>
              {:else}
                <button type="button" class="primary" on:click={() => moveSection(1)} disabled={runSections.length === 0}>
                  Weiter
                </button>
              {/if}
            </div>
          </div>

          <div class="panel-soft run-preview-pane">
            <div class="run-preview-head">
              <h3>Live-Vorschau</h3>
              <div class="row run-preview-nav">
                <button
                  type="button"
                  on:click={() => moveRunPreviewPage(-1)}
                  disabled={!runPreviewDoc || runPreviewTarget?.page <= 1 || runPreviewDocBusy}
                >
                  Zurück
                </button>
                <span class="meta">Seite {runPreviewTarget?.page || 1} / {runPreviewPageCount}</span>
                <button
                  type="button"
                  on:click={() => moveRunPreviewPage(1)}
                  disabled={!runPreviewDoc || runPreviewTarget?.page >= runPreviewPageCount || runPreviewDocBusy}
                >
                  Weiter
                </button>
              </div>
            </div>
            {#if runPreviewDocBusy}
              <p class="meta run-preview-loading">Vorschau wird aktualisiert ...</p>
            {/if}
            <canvas bind:this={runCanvas}></canvas>
          </div>
        </div>
      </div>

      {#if runExports.length > 0}
        <div class="export-list">
          <h3>Export-Historie</h3>
          <div class="export-list-scroll">
            {#each runExports as item}
              <div class="meta export-item">{item.fileName} · {new Date(item.exportedAt).toLocaleString('de-DE')}</div>
            {/each}
          </div>
        </div>
      {/if}

      {#if runFinishDialogOpen}
        <button type="button" class="dialog-backdrop" aria-label="Dialog schließen" on:click={closeRunFinishDialog}></button>
        <div class="dialog-panel" role="dialog" aria-modal="true" aria-labelledby="run-finish-title">
          <h3 id="run-finish-title">BTB abschließen</h3>
          <p class="meta">Was möchtest du als Nächstes tun?</p>
          <fieldset class="radios run-finish-export-mode">
            <legend>PDF-Export</legend>
            <label class="check">
              <input
                type="radio"
                name="run_finish_export_mode"
                value={RUN_FINISH_EXPORT_MODE_BTB}
                checked={runFinishExportMode === RUN_FINISH_EXPORT_MODE_BTB}
                on:change={(event) => (runFinishExportMode = normalizeRunFinishExportMode(event.currentTarget.value))}
              />
              BTB
            </label>
            <label class="check">
              <input
                type="radio"
                name="run_finish_export_mode"
                value={RUN_FINISH_EXPORT_MODE_PHOTO}
                checked={runFinishExportMode === RUN_FINISH_EXPORT_MODE_PHOTO}
                on:change={(event) => (runFinishExportMode = normalizeRunFinishExportMode(event.currentTarget.value))}
              />
              Fotodoku
            </label>
            <label class="check">
              <input
                type="radio"
                name="run_finish_export_mode"
                value={RUN_FINISH_EXPORT_MODE_MERGED}
                checked={runFinishExportMode === RUN_FINISH_EXPORT_MODE_MERGED}
                on:change={(event) => (runFinishExportMode = normalizeRunFinishExportMode(event.currentTarget.value))}
              />
              BTB + Fotodoku
            </label>
          </fieldset>
          <div class="row start run-finish-actions">
            <button type="button" class="primary" on:click={finishRunWithPdf}>
              {runFinishExportMode === RUN_FINISH_EXPORT_MODE_BTB
                ? 'BTB herunterladen'
                : runFinishExportMode === RUN_FINISH_EXPORT_MODE_PHOTO
                  ? 'Fotodoku herunterladen'
                  : 'BTB + Fotodoku herunterladen'}
            </button>
            <button type="button" on:click={finishRunToStart}>Zurück zur Startseite</button>
            <button type="button" on:click={closeRunFinishDialog}>Abbrechen</button>
          </div>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .page {
    max-width: 1240px;
    margin: 0 auto;
    padding: 32px 20px 80px;
  }

  .hero {
    align-items: flex-start;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 24px;
  }

  .eyebrow {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.14em;
    margin: 0 0 6px;
    text-transform: uppercase;
  }

  h1 {
    margin: 0;
    font-size: clamp(32px, 5vw, 48px);
    letter-spacing: -0.02em;
  }

  h2 {
    margin: 0;
    font-size: 24px;
  }

  h3 {
    margin: 0;
    font-size: 18px;
  }

  h4 {
    margin: 0;
    font-size: 16px;
  }

  .sub {
    color: var(--muted);
    margin: 8px 0 0;
    max-width: 860px;
  }

  .toolbox-link {
    align-self: center;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--ink);
    display: inline-flex;
    padding: 8px 14px;
    text-decoration: none;
    font-weight: 600;
    transition: all 130ms ease;
  }

  .toolbox-link:hover {
    border-color: var(--accent);
    transform: translateY(-1px);
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow);
    margin-top: 16px;
    padding: 18px;
  }

  .panel-soft {
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }

  .grid-two {
    display: grid;
    gap: 12px;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .field > span {
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
  }

  input,
  select,
  button {
    font: inherit;
  }

  input:not([type='checkbox']):not([type='radio']),
  select {
    background: #fffefb;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 9px 10px;
  }

  input:not([type='checkbox']):not([type='radio']):focus,
  select:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(211, 84, 60, 0.15);
    outline: none;
  }

  input[type='checkbox'],
  input[type='radio'] {
    accent-color: var(--accent);
    background: #fff;
    border: 1px solid var(--border);
    height: 16px;
    margin: 0;
    padding: 0;
    width: 16px;
  }

  input[type='checkbox'] {
    border-radius: 4px;
  }

  input[type='radio'] {
    border-radius: 999px;
  }

  input[type='checkbox']:focus,
  input[type='radio']:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 3px rgba(211, 84, 60, 0.15);
    outline: none;
  }

  button {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    font-weight: 600;
    padding: 8px 12px;
    transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
  }

  button:hover {
    background: #fff6ec;
    border-color: var(--accent);
    box-shadow: 0 8px 18px rgba(23, 21, 18, 0.08);
    transform: translateY(-1px);
  }

  button:disabled {
    cursor: not-allowed;
    opacity: 0.55;
    transform: none;
  }

  .primary {
    background: var(--accent);
    border-color: var(--accent);
    color: #fff;
  }

  .primary:hover {
    background: #be4a34;
    border-color: #be4a34;
  }

  .button-like {
    align-items: center;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
    cursor: pointer;
    display: inline-flex;
    font-size: 14px;
    font-weight: 600;
    gap: 6px;
    min-height: 36px;
    padding: 8px 12px;
    transition: transform 120ms ease, border-color 120ms ease, background 120ms ease, box-shadow 120ms ease;
  }

  .button-like:hover {
    background: #fff6ec;
    border-color: var(--accent);
    box-shadow: 0 8px 18px rgba(23, 21, 18, 0.08);
    transform: translateY(-1px);
  }

  .button-like input[type='file'] {
    display: none;
  }

  .danger {
    background: #fff5f5;
    border-color: #f3c8c8;
    color: #9f1c1c;
  }

  .danger:hover {
    border-color: #e07272;
  }

  .row,
  .title-row {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    justify-content: flex-end;
  }

  .title-row {
    justify-content: space-between;
    margin-bottom: 10px;
  }

  .row.start {
    justify-content: flex-start;
    margin-top: 10px;
  }

  .row.between {
    justify-content: space-between;
  }

  .meta {
    color: var(--muted);
    font-size: 13px;
  }

  .muted {
    color: var(--muted);
    margin: 4px 0 0;
  }

  .notice {
    border: 1px solid;
    border-radius: 10px;
    margin-top: 10px;
    padding: 10px 12px;
  }

  .notice.ok {
    background: #edf8f1;
    border-color: #bcdcc6;
    color: #135c32;
  }

  .notice.error {
    background: #fff3f2;
    border-color: #f3c6c1;
    color: #8d1d17;
  }

  .notice.warn {
    background: #fff7ec;
    border-color: #eed7aa;
    color: #8b5e0c;
  }

  .dialog-backdrop {
    background: rgba(7, 14, 28, 0.45);
    border: none;
    cursor: default;
    inset: 0;
    margin: 0;
    padding: 0;
    position: fixed;
    z-index: 40;
  }

  .dialog-backdrop:hover {
    border: none;
    transform: none;
  }

  .dialog-panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
    left: 50%;
    max-width: min(520px, calc(100vw - 24px));
    padding: 16px;
    position: fixed;
    top: 50%;
    transform: translate(-50%, -50%);
    width: 100%;
    z-index: 41;
  }

  .dialog-panel p {
    margin: 6px 0 0;
  }

  .run-finish-export-mode {
    margin: 10px 0 0;
  }

  .run-finish-export-mode .check {
    display: flex;
    margin-top: 6px;
  }

  .run-finish-actions {
    flex-wrap: wrap;
  }

  .template-list {
    display: grid;
    gap: 10px;
  }

  .home-week-groups {
    display: grid;
    gap: 10px;
  }

  .home-runs-scroll {
    max-height: min(62vh, 760px);
    overflow-y: auto;
    padding-right: 4px;
  }

  .home-week-group {
    background: #fffefb;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 10px;
  }

  .home-week-toggle {
    align-items: center;
    display: flex;
    justify-content: space-between;
    text-align: left;
    width: 100%;
  }

  .home-week-toggle-main {
    align-items: baseline;
    display: inline-flex;
    gap: 8px;
  }

  .home-week-toggle-main small {
    color: var(--muted);
    font-size: 12px;
    font-weight: 600;
  }

  .home-week-toggle-side {
    align-items: center;
    display: inline-flex;
    gap: 8px;
  }

  .home-week-chevron {
    font-family: monospace;
    font-size: 14px;
    font-weight: 700;
    width: 10px;
  }

  .home-week-body {
    margin-top: 10px;
  }

  .template-card {
    align-items: center;
    background: #fffefb;
    border: 1px solid var(--border);
    border-radius: 12px;
    display: flex;
    gap: 10px;
    justify-content: space-between;
    padding: 12px;
    position: relative;
  }

  .template-card--home-selectable {
    cursor: pointer;
    user-select: none;
    transition: border-color 160ms ease, box-shadow 180ms ease, transform 180ms ease, background-color 180ms ease;
  }

  .template-card--home-selectable:hover {
    border-color: rgba(211, 84, 60, 0.35);
    transform: translateY(-1px);
  }

  .template-card--home-selectable:focus-visible {
    outline: 2px solid rgba(211, 84, 60, 0.4);
    outline-offset: 2px;
  }

  .template-card--new-run {
    justify-content: flex-start;
  }

  .template-card--new-run > div {
    width: min(100%, 420px);
  }

  .template-card.selected-run {
    border-color: rgba(211, 84, 60, 0.45);
    box-shadow: 0 0 0 2px rgba(211, 84, 60, 0.14);
    background: #fff9f5;
  }

  .template-card.selected-run h3 {
    color: var(--ink);
    font-weight: 700;
  }

  .template-card.selected-run .meta {
    color: var(--muted);
  }

  .template-card.selected-run-pulse {
    animation: home-run-select-pulse 320ms ease-out;
  }

  .template-card h3 {
    margin: 0 0 4px;
  }

  .home-run-name-field {
    min-width: min(100%, 320px);
  }

  .home-new-run-hint {
    margin: 0 0 8px;
  }

  .home-setup-actions {
    margin-top: 8px;
  }

  .home-run-select-actions {
    margin-bottom: 8px;
  }

  .home-run-selection-summary {
    align-items: center;
    gap: 8px;
  }

  .home-run-selection-pill {
    display: inline-flex;
    align-items: center;
    margin-top: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    border: 1px solid rgba(211, 84, 60, 0.35);
    background: #fff;
    color: #8b3a2b;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.01em;
  }

  @keyframes home-run-select-pulse {
    0% {
      transform: scale(0.985);
    }
    60% {
      transform: scale(1.01);
    }
    100% {
      transform: scale(1);
    }
  }

  .weather-sync-actions {
    margin: 0 0 8px;
  }

  .setup-grid {
    display: grid;
    gap: 12px;
    grid-template-columns: minmax(0, 1.7fr) minmax(280px, 1fr);
    margin-top: 12px;
  }

  .setup-grid > * {
    min-width: 0;
  }

  .setup-workbench {
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(190px, 270px) minmax(0, 1fr);
    align-items: start;
    min-width: 0;
    position: relative;
    z-index: 2;
  }

  .setup-nav {
    background: #fffefb;
    border: 1px solid var(--border);
    border-radius: 10px;
    display: grid;
    gap: 8px;
    max-height: calc(100vh - 170px);
    overflow: auto;
    padding: 10px;
    position: sticky;
    top: 12px;
  }

  .setup-nav-head {
    align-items: center;
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  .setup-nav-list {
    display: grid;
    gap: 6px;
  }

  .setup-nav-item {
    align-items: flex-start;
    border-radius: 10px;
    display: grid;
    gap: 2px;
    justify-items: flex-start;
    text-align: left;
    width: 100%;
  }

  .setup-nav-item small {
    color: var(--muted);
    font-size: 12px;
  }

  .setup-nav-item.active {
    background: #fff0e5;
    border-color: var(--accent);
  }

  .setup-editor {
    min-height: 520px;
    min-width: 0;
    overflow: visible;
    position: relative;
    z-index: 3;
  }

  .setup-preview-pane {
    align-self: start;
    max-height: calc(100vh - 170px);
    overflow: auto;
    position: sticky;
    top: 12px;
    z-index: 0;
  }

  .section-card {
    background: #fffefb;
    border: 1px solid var(--border);
    border-radius: 12px;
    display: grid;
    gap: 10px;
    margin-top: 10px;
    padding: 10px;
    min-width: 0;
    overflow: visible;
  }

  .line {
    align-items: end;
    display: grid;
    gap: 8px;
    grid-template-columns: minmax(0, 1fr) minmax(170px, 230px);
    min-width: 0;
  }

  .line.line-setup {
    grid-template-columns: minmax(0, 1fr);
  }

  .setup-field-card {
    background: #fff8ef;
    border: 1px solid #ecdcc9;
    border-radius: 12px;
    padding: 10px;
    padding-top: 36px;
    position: relative;
  }

  .setup-field-card:hover,
  .setup-field-card:focus-within {
    background: #fffefb;
    border-color: #d9a07c;
    box-shadow: 0 0 0 2px rgba(211, 84, 60, 0.13);
  }

  .field-drag-handle {
    align-items: center;
    border-radius: 8px;
    display: inline-flex;
    font-size: 16px;
    font-weight: 700;
    height: 24px;
    justify-content: center;
    letter-spacing: 1px;
    line-height: 1;
    padding: 0;
    position: absolute;
    right: 8px;
    top: 8px;
    touch-action: none;
    width: 32px;
    z-index: 2;
  }

  .field-drag-handle:hover {
    cursor: grab;
  }

  .field-drag-handle:active {
    cursor: grabbing;
  }

  .setup-field-card.drag-source {
    border-style: dashed;
    opacity: 0.72;
  }

  .setup-field-card.drag-target-before::before,
  .setup-field-card.drag-target-after::after {
    background: var(--accent);
    border-radius: 999px;
    content: '';
    height: 3px;
    left: 8px;
    position: absolute;
    right: 8px;
  }

  .setup-field-card.drag-target-before::before {
    top: 5px;
  }

  .setup-field-card.drag-target-after::after {
    bottom: 5px;
  }

  .line-main-stacked {
    display: grid;
    gap: 6px;
  }

  .line-controls {
    align-items: flex-start;
    border-top: 1px dashed var(--border);
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    justify-content: flex-start;
    min-width: 0;
    padding-top: 8px;
    width: 100%;
  }

  .group-select-card {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
    min-width: 0;
    padding: 8px;
  }

  .group-select-title {
    color: var(--accent-2);
    font-size: 12px;
    font-weight: 700;
    margin: 0 0 6px;
  }

  .group-select {
    min-width: 0;
    width: 100%;
  }

  .line-controls .group-select-card {
    flex: 1 1 240px;
    max-width: 390px;
  }

  .group-select select {
    max-width: 100%;
    width: 100%;
    position: relative;
    z-index: 5;
  }

  .line-main {
    min-width: 0;
    width: 100%;
  }

  .field input,
  .field select {
    min-width: 0;
    width: 100%;
  }

  .line-flags {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .setup-field-card .line-flags {
    align-items: flex-start;
    display: grid;
    gap: 6px;
    justify-items: flex-start;
    padding-top: 2px;
  }

  .line-flags-inline {
    justify-content: flex-start;
    width: 100%;
  }

  .setup-section-actions {
    border-top: 1px solid var(--border);
    margin-top: 2px;
    padding-top: 8px;
  }

  .check {
    align-items: center;
    color: var(--ink);
    cursor: pointer;
    display: inline-flex;
    gap: 6px;
    white-space: normal;
  }

  .shift-stack {
    grid-column: 1 / -1;
  }

  .shift-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .shift-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .shift-option {
    align-items: start;
    display: grid;
    gap: 10px;
    grid-template-columns: 16px minmax(0, 1fr);
    min-height: 28px;
    width: fit-content;
  }

  .shift-option span {
    line-height: 1.3;
  }

  .shift-inline-error {
    margin-left: 0;
  }

  .table-config {
    border-top: 1px solid var(--border);
    margin-top: 6px;
    padding-top: 8px;
  }

  canvas {
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
    display: block;
    margin-top: 8px;
    width: 100%;
  }

  .setup-preview-legend {
    display: grid;
    gap: 4px;
    margin-top: 8px;
  }

  .setup-preview-legend p {
    margin: 0;
  }

  .run-layout {
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  }

  .run-nav {
    align-self: start;
    background: #fff7ee;
    border: 1px solid var(--border);
    border-radius: 12px;
    display: grid;
    gap: 6px;
    max-height: 70vh;
    overflow: auto;
    padding: 8px;
    position: sticky;
    top: 12px;
  }

  .nav-item {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: flex-start;
    text-align: left;
  }

  .nav-item.active {
    background: #fff0e5;
    border-color: var(--accent);
  }

  .nav-main {
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .nav-main small {
    color: var(--muted);
    font-size: 12px;
  }

  .dot {
    border-radius: 999px;
    display: inline-block;
    height: 10px;
    width: 10px;
  }

  .dot.todo {
    background: #c7b8a4;
  }

  .dot.progress {
    background: #d88a2d;
  }

  .dot.done {
    background: #368657;
  }

  .run-workbench {
    align-items: start;
    display: grid;
    gap: 10px;
    grid-template-columns: minmax(0, 1.2fr) minmax(300px, 0.85fr);
    min-width: 0;
  }

  .run-workbench > * {
    min-width: 0;
  }

  .run-main {
    background: #fffefb;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 12px;
  }

  .run-main .run-text-input {
    font-size: 14px;
    line-height: 1.35;
  }

  .run-main .run-text-input.run-text-input--compact {
    font-size: 12px;
    line-height: 1.3;
  }

  .run-main .run-text-input.run-text-input--compact-table {
    font-size: 13px;
    line-height: 1.3;
  }

  .run-main .run-textarea-input {
    font-size: var(--run-text-size, 14px);
    line-height: 1.35;
    max-height: 168px;
    min-height: 36px;
    overflow-y: hidden;
    resize: none;
    white-space: pre-wrap;
  }

  .run-main .run-textarea-input.run-textarea-input--detail-main {
    min-height: 112px;
    max-height: 320px;
  }

  .run-main .run-textarea-input.run-textarea-input--detail-secondary {
    min-height: 84px;
    max-height: 260px;
  }

  .run-preview-pane {
    align-self: start;
    max-height: 70vh;
    overflow: auto;
    position: sticky;
    top: 12px;
  }

  .run-preview-head {
    align-items: center;
    display: flex;
    gap: 8px;
    justify-content: space-between;
  }

  .run-preview-nav {
    align-items: center;
    gap: 6px;
    justify-content: flex-end;
    margin: 0;
  }

  .run-preview-loading {
    margin: 8px 0 0;
  }

  .input-invalid {
    border-color: #cf5549 !important;
    box-shadow: 0 0 0 2px rgba(207, 85, 73, 0.12);
  }

  .inline-error {
    color: #8d1d17;
    font-size: 12px;
    font-weight: 600;
  }

  .field .inline-error {
    margin-top: 2px;
  }

  .radio-list.input-invalid,
  .radios.input-invalid {
    border-color: #cf5549;
  }

  .radios {
    border: 1px solid var(--border);
    border-radius: 10px;
    gap: 7px;
    padding: 8px;
  }

  .radios legend {
    color: var(--muted);
    font-size: 13px;
    font-weight: 600;
    padding: 0 4px;
  }

  .run-table-rows {
    display: grid;
    gap: 10px;
  }

  .run-row-card {
    background: #fffaf3;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 10px;
  }

  .run-row-card--detail {
    background: #fff7ed;
  }

  .run-row-head {
    align-items: center;
    border-bottom: 1px dashed var(--border);
    display: flex;
    justify-content: space-between;
    margin-bottom: 10px;
    padding-bottom: 6px;
  }

  .run-row-head strong {
    font-size: 13px;
    letter-spacing: 0.02em;
    text-transform: uppercase;
  }

  .run-row-fields {
    display: grid;
    gap: 10px;
  }

  .run-row-fields--default {
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  }

  .run-row-fields--personal {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }

  .run-row-fields--detail {
    grid-template-columns: minmax(140px, 180px) minmax(220px, 1fr);
  }

  .run-cell-field--detail-main,
  .run-cell-field--detail-secondary {
    grid-column: 1 / -1;
  }

  .run-cell-label--multiline {
    white-space: pre-line;
  }

  .run-cell-field--personal-company {
    grid-column: 1 / -1;
  }

  .run-cell-field--time input {
    max-width: 130px;
  }

  .run-cell-field--compact input {
    max-width: 100%;
  }

  .radio-list {
    display: grid;
    gap: 4px;
  }

  .table-rows-actions {
    border-top: 1px solid var(--border);
    margin-top: 8px;
    padding-top: 8px;
  }

  .photo-doc-step {
    display: grid;
    gap: 10px;
  }

  .photo-doc-choice {
    margin: 0;
  }

  .photo-doc-actions {
    align-items: center;
    margin: 0;
  }

  .photo-doc-editor {
    background: #fff8ef;
    border: 1px solid #ecdcc9;
    border-radius: 10px;
    display: grid;
    gap: 10px;
    padding: 10px;
  }

  .photo-doc-toolbar {
    margin: 0;
  }

  .photo-doc-list {
    display: grid;
    gap: 8px;
  }

  .photo-doc-entry {
    align-items: start;
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 10px;
    display: grid;
    gap: 10px;
    grid-template-columns: 148px minmax(0, 1fr);
    padding: 8px;
  }

  .photo-doc-thumb-wrap {
    border: 1px solid var(--border);
    border-radius: 8px;
    overflow: hidden;
  }

  .photo-doc-thumb {
    display: block;
    height: 110px;
    object-fit: cover;
    width: 100%;
  }

  .photo-doc-meta {
    display: grid;
    gap: 8px;
    min-width: 0;
  }

  .photo-doc-entry-actions {
    margin: 0;
  }

  .photo-doc-empty-hint {
    margin: 0;
  }

  .row.end {
    justify-content: space-between;
    margin-top: 10px;
  }

  .export-list {
    border-top: 1px solid var(--border);
    display: grid;
    gap: 8px;
    margin-top: 12px;
    padding-top: 12px;
  }

  .export-list-scroll {
    display: grid;
    gap: 4px;
    max-height: 220px;
    overflow-y: auto;
    padding-right: 4px;
  }

  .export-item {
    line-height: 1.35;
  }

  @media (max-width: 1040px) {
    .setup-grid {
      grid-template-columns: 1fr;
    }

    .setup-workbench {
      grid-template-columns: 1fr;
    }

    .setup-nav,
    .setup-preview-pane {
      max-height: none;
      position: static;
    }

    .run-layout {
      grid-template-columns: 1fr;
    }

    .run-workbench {
      grid-template-columns: 1fr;
    }

    .run-nav,
    .run-preview-pane {
      max-height: none;
      position: static;
    }
  }

  @media (max-width: 920px) {
    .line,
    .line.line-setup {
      grid-template-columns: 1fr;
    }

    .line-controls .group-select-card {
      flex-basis: 100%;
      max-width: none;
    }

    .line-flags-inline,
    .line-flags {
      justify-content: flex-start;
    }
  }

  @media (max-width: 720px) {
    .page {
      padding: 16px 12px 56px;
    }

    .hero {
      flex-direction: column;
      gap: 10px;
      margin-bottom: 14px;
    }

    .toolbox-link {
      align-self: flex-start;
    }

    .panel {
      padding: 12px;
    }

    .title-row {
      align-items: flex-start;
      gap: 10px;
    }

    .title-row .row {
      justify-content: flex-start;
      width: 100%;
    }

    .title-row .row button {
      flex: 1 1 160px;
    }

    .home-week-toggle {
      align-items: flex-start;
      flex-direction: column;
      gap: 6px;
    }

    .home-week-toggle-side {
      justify-content: space-between;
      width: 100%;
    }

    .home-runs-scroll {
      max-height: min(56vh, 620px);
    }

    .run-nav {
      display: flex;
      gap: 8px;
      max-height: none;
      overflow-x: auto;
      overflow-y: hidden;
      scroll-snap-type: x mandatory;
      white-space: nowrap;
    }

    .nav-item {
      flex: 0 0 210px;
      min-height: 56px;
      scroll-snap-align: start;
    }

    .run-main {
      padding: 10px;
    }

    .run-preview-pane {
      padding: 10px;
    }

    .run-preview-head {
      align-items: flex-start;
      flex-direction: column;
    }

    .run-preview-nav {
      justify-content: flex-start;
      width: 100%;
    }

    .export-list-scroll {
      max-height: 180px;
    }

    .section-card {
      padding: 8px;
    }

    .field-drag-handle {
      height: 28px;
      right: 6px;
      top: 6px;
      width: 36px;
    }

    .run-row-fields--detail {
      grid-template-columns: 1fr;
    }

    .photo-doc-entry {
      grid-template-columns: 1fr;
    }

    .run-cell-field--time input {
      max-width: none;
      width: 100%;
    }

    .line {
      grid-template-columns: 1fr;
    }

    .template-card {
      align-items: flex-start;
      flex-direction: column;
    }
  }

  @media (max-width: 560px) {
    h1 {
      font-size: clamp(24px, 8vw, 34px);
    }

    .grid-two {
      grid-template-columns: 1fr;
    }

    .review-item {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }

    .run-main .run-text-input {
      font-size: 13px;
    }

    .run-main .run-textarea-input {
      font-size: var(--run-text-size, 13px);
    }
  }
</style>

<script>
  import { onMount, tick } from 'svelte';
  import { base } from '$app/paths';
  import { version as appVersion } from '$app/environment';
  import {
    addEntry,
    listEntries,
    loadSettings,
    saveSettings,
    clearEntries,
    clearSettings,
    loadLogo,
    saveLogo,
    clearLogo,
    deleteEntry,
    addTemplate,
    listTemplates,
    updateTemplate,
    listProtocols,
    addProtocol,
    getProtocol,
    deleteProtocol,
    listExports,
    upsertExportByProtocol,
    deleteExportsByProtocol,
    deleteExport
  } from '$lib/db';
  import { compressImage, blobToObjectUrl } from '$lib/image';
  import { exportToXlsxData } from '$lib/export';
  import { exportToPdfData } from '$lib/pdf';
  import { getNativePlatform, isNativePlatform, saveBase64File, shareFile } from '$lib/native';

  const generateId = () => `col_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const withColumnIds = (cols) => cols.map((col) => ({ id: col.id ?? generateId(), ...col }));

  const defaultColumns = withColumnIds([
    { name: 'Bilder', type: 'text', isPhoto: true },
    { name: 'Kilometer', type: 'number', isPhoto: false },
    { name: 'Beschreibung', type: 'text', isPhoto: false },
    { name: 'Status', type: 'text', isPhoto: false }
  ]);

  let view = 'landing';

  let protocolTitle = '';
  let projectName = '';
  let protocolDate = today();
  let protocolDescription = '';
  let attendees = '';
  let logoDataUrl = '';
  let columns = defaultColumns.map((col) => ({ ...col }));

  let newColName = '';
  let newColType = 'text';

  let entries = [];
  let entryDraft = {
    fields: {},
    photoFile: null,
    photoPreview: ''
  };
  let editingEntryId = null;

  let stepIndex = 0;
  let entrySteps = [];
  let currentField = null;
  let entryInputRef;

  let templates = [];
  let selectedTemplateId = '';
  let templateName = '';
  let isCreatingFormat = false;
  let isEditingFormat = false;
  let formatMode = 'new';
  let formatReturnView = 'start';
  let formatBackup = null;
  let showFormatInfo = false;
  let formatError = '';
  let formatNameTouched = false;
  let protocolTitleTouched = false;
  let editingColIndex = null;
  let editColName = '';
  let editColType = 'text';
  let dragState = {
    active: false,
    id: null,
    x: 0,
    y: 0,
    width: 0,
    height: 0,
    offsetX: 0,
    offsetY: 0,
    fromIndex: null,
    overIndex: null,
    label: ''
  };

  let protocolsList = [];
  let exportsList = [];

  let activeProtocolId = null;
  let activeProtocolCreatedAt = null;

  let isSaving = false;
  let isExporting = false;
  let saveError = '';
  let closeError = '';
  let downloadError = '';
  let isDirty = false;
  let selectionModeProtocols = false;
  let selectedProtocols = new Set();
  let selectionModeExports = false;
  let selectedExports = new Set();
  let updateAvailable = false;
  let toastMessage = '';
  let toastTimer = null;
  let confirmDialog = {
    open: false,
    title: '',
    message: '',
    primaryLabel: '',
    secondaryLabel: '',
    tertiaryLabel: '',
    showCancel: true,
    secondaryDanger: false,
    onPrimary: null,
    onSecondary: null,
    onTertiary: null
  };
  let downloadDialog = {
    open: false,
    title: '',
    onExcel: null,
    onPdf: null
  };
  let lastView = view;
  let suppressHistory = false;

  onMount(async () => {
    const saved = await loadSettings();
    if (saved) {
      columns = withColumnIds(saved.columns ?? columns);
      selectedTemplateId = saved.selectedTemplateId ?? selectedTemplateId;
    }
    protocolTitle = '';
    projectName = '';
    protocolDate = today();
    logoDataUrl = (await loadLogo()) || '';

    const storedEntries = await listEntries();
    entries = storedEntries.map((e) => ({
      ...e,
      photoPreview: e.photoBlob ? blobToObjectUrl(e.photoBlob) : ''
    }));

    templates = await listTemplates();
    protocolsList = await listProtocols();
    exportsList = await listExports();

    const checkForUpdate = async () => {
      try {
        const res = await fetch(`${base}/_app/version.json`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.version && data.version !== appVersion) {
          updateAvailable = true;
          console.log('[update] Neue Version verfügbar:', data.version);
        }
      } catch {
        // ignore network errors
      }
    };

    await checkForUpdate();
    const interval = setInterval(checkForUpdate, 300000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') checkForUpdate();
    };
    document.addEventListener('visibilitychange', onVisible);

    const onPopState = (event) => {
      if (event.state?.view) {
        suppressHistory = true;
        view = event.state.view;
        lastView = view;
        suppressHistory = false;
      }
    };
    history.replaceState({ view }, '');
    window.addEventListener('popstate', onPopState);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('popstate', onPopState);
    };
  });

  $: if (view !== lastView) {
    if (!suppressHistory) {
      history.pushState({ view }, '');
    }
    lastView = view;
  }

  const persistSettings = async () => {
    await saveSettings({
      columns,
      selectedTemplateId
    });
  };

  const addColumn = () => {
    if (!newColName.trim()) return;
    columns = [...columns, { id: generateId(), name: newColName.trim(), type: newColType, isPhoto: false }];
    newColName = '';
    newColType = 'text';
    isDirty = true;
  };

  const removeColumn = (id) => {
    const target = columns.find((c) => c.id === id);
    if (!target || target.isPhoto) return;
    columns = columns.filter((c) => c.id !== id);
    isDirty = true;
  };

  const applyTemplate = () => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    columns = tpl.columns?.length ? withColumnIds(tpl.columns) : columns;
    isDirty = true;
    persistSettings();
    isCreatingFormat = false;
    isEditingFormat = false;
  };

  const saveTemplate = async () => {
    if (!templateName.trim()) {
      formatError = 'Bitte gib einen Formatnamen ein.';
      formatNameTouched = true;
      return;
    }
    formatError = '';
    const record = {
      id: `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: new Date().toISOString(),
      name: templateName.trim(),
      columns: columns.map((c) => ({ ...c }))
    };
    await addTemplate(record);
    templates = [record, ...templates];
    selectedTemplateId = record.id;
    templateName = '';
    formatError = '';
    formatNameTouched = false;
    persistSettings();
    isCreatingFormat = false;
    isEditingFormat = false;
    isDirty = true;
    formatBackup = null;
    view = formatReturnView;
  };

  const startNewFormat = () => {
    formatReturnView = view;
    formatBackup = {
      columns: columns.map((c) => ({ ...c })),
      selectedTemplateId
    };
    isCreatingFormat = true;
    isEditingFormat = false;
    formatMode = 'new';
    selectedTemplateId = '';
    templateName = '';
    columns = [{ ...defaultColumns[0] }];
    newColName = '';
    newColType = 'text';
    view = 'format-builder';
  };

  const startEditFormat = () => {
    if (!selectedTemplateId) return;
    formatReturnView = view;
    formatBackup = {
      columns: columns.map((c) => ({ ...c })),
      selectedTemplateId
    };
    isEditingFormat = true;
    isCreatingFormat = false;
    formatMode = 'edit';
    view = 'format-builder';
  };

  const saveEditedFormat = async () => {
    if (!selectedTemplateId) return;
    const tpl = templates.find((t) => t.id === selectedTemplateId);
    if (!tpl) return;
    const updated = {
      ...tpl,
      columns: columns.map((c) => ({ ...c }))
    };
    await updateTemplate(updated);
    templates = templates.map((t) => (t.id === updated.id ? updated : t));
    isEditingFormat = false;
    persistSettings();
    isDirty = true;
    formatBackup = null;
    view = formatReturnView;
  };

  const cancelFormatEdit = () => {
    if (formatBackup) {
      columns = formatBackup.columns.map((c) => ({ ...c }));
      selectedTemplateId = formatBackup.selectedTemplateId;
    }
    isCreatingFormat = false;
    isEditingFormat = false;
    formatBackup = null;
    formatError = '';
    formatNameTouched = false;
    view = formatReturnView;
  };

  const reorderColumns = (from, to) => {
    if (from === null || to === null || from === to) return;
    const next = columns.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    columns = next;
    isDirty = true;
  };

  const startEditColumn = (idx) => {
    const col = columns[idx];
    if (!col) return;
    editingColIndex = idx;
    editColName = col.name;
    editColType = col.type;
  };

  const saveEditColumn = () => {
    if (editingColIndex === null) return;
    if (!editColName.trim()) return;
    columns = columns.map((col, idx) => {
      if (idx !== editingColIndex) return col;
      if (col.isPhoto) {
        return { ...col, name: editColName.trim() };
      }
      return { ...col, name: editColName.trim(), type: editColType };
    });
    isDirty = true;
    editingColIndex = null;
    editColName = '';
    editColType = 'text';
  };

  const cancelEditColumn = () => {
    editingColIndex = null;
    editColName = '';
    editColType = 'text';
  };

  const startPointerDrag = (event, idx) => {
    if (editingColIndex === idx) return;
    if (event.button !== undefined && event.button !== 0) return;
    const target = event.target;
    if (target?.closest?.('button, input, select, textarea') && !target?.closest?.('.drag-handle')) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragState = {
      active: true,
      id: columns[idx]?.id ?? null,
      width: rect.width,
      height: rect.height,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      x: event.clientX - rect.left + 10,
      y: event.clientY - rect.top + 10,
      fromIndex: idx,
      overIndex: idx,
      label: columns[idx]?.name ?? ''
    };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const movePointerDrag = (event) => {
    if (!dragState.active) return;
    event.preventDefault();
    dragState = {
      ...dragState,
      x: event.clientX - dragState.offsetX + 10,
      y: event.clientY - dragState.offsetY + 10
    };
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const card = target?.closest?.('.col-card');
    if (!card) {
      dragState = { ...dragState, overIndex: columns.length };
      return;
    }
    const idx = Number(card.dataset.index);
    if (Number.isNaN(idx)) return;
    if (idx !== dragState.overIndex) {
      dragState = { ...dragState, overIndex: idx };
    }
  };

  const endPointerDrag = () => {
    if (!dragState.active) return;
    if (dragState.fromIndex !== null && dragState.overIndex !== null) {
      reorderColumns(dragState.fromIndex, dragState.overIndex);
    }
    dragState = {
      active: false,
      id: null,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      offsetX: 0,
      offsetY: 0,
      fromIndex: null,
      overIndex: null,
      label: ''
    };
  };

  let scrollLock = { active: false, y: 0 };
  $: if (typeof document !== 'undefined') {
    if (dragState.active && !scrollLock.active) {
      scrollLock = { active: true, y: window.scrollY || 0 };
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollLock.y}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.overflow = 'hidden';
      document.body.style.touchAction = 'none';
      document.documentElement.style.overflow = 'hidden';
      document.documentElement.style.touchAction = 'none';
    } else if (!dragState.active && scrollLock.active) {
      const restoreY = scrollLock.y;
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      document.body.style.overflow = '';
      document.body.style.touchAction = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.touchAction = '';
      window.scrollTo(0, restoreY);
      scrollLock = { active: false, y: 0 };
    }
  }

  const startProtocol = async () => {
    if (!selectedTemplateId) {
      saveError = 'Bitte zuerst ein Tabellenformat auswählen.';
      return;
    }
    if (!protocolTitle.trim()) {
      saveError = 'Bitte einen Protokoll-Namen eingeben.';
      protocolTitleTouched = true;
      return;
    }
    saveError = '';
    activeProtocolId = null;
    activeProtocolCreatedAt = null;
    await clearEntries();
    entries = [];
    await persistSettings();
    isDirty = false;
    view = 'main';
  };

  const startNewProtocolSetup = async () => {
    await clearEntries();
    entries = [];
    activeProtocolId = null;
    activeProtocolCreatedAt = null;
    protocolTitle = '';
    protocolTitleTouched = false;
    projectName = '';
    protocolDate = today();
    protocolDescription = '';
    attendees = '';
    editingEntryId = null;
    entryDraft = { fields: {}, photoFile: null, photoPreview: '' };
    stepIndex = 0;
    entrySteps = [];
    currentField = null;
    saveError = '';
    closeError = '';
    downloadError = '';
    isDirty = false;
    view = 'start';
  };

  const saveSetup = async () => {
    if (!protocolTitle.trim()) {
      saveError = 'Bitte einen Protokoll-Namen eingeben.';
      protocolTitleTouched = true;
      return;
    }
    saveError = '';
    await persistSettings();
    isDirty = true;
    view = 'main';
  };

  const handleLogoUpload = async (event) => {
    const file = event.target?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      logoDataUrl = reader.result;
      await saveLogo(logoDataUrl);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const removeLogo = async () => {
    logoDataUrl = '';
    await clearLogo();
  };

  const openProtocol = async (id) => {
    const protocol = await getProtocol(id);
    if (!protocol) return;
    activeProtocolId = protocol.id;
    activeProtocolCreatedAt = protocol.createdAt;
    protocolTitle = protocol.protocolTitle || '';
    projectName = protocol.projectName || '';
    protocolDate = protocol.protocolDate || today();
    protocolDescription = protocol.protocolDescription || '';
    attendees = protocol.attendees || '';
    columns = protocol.columns?.length ? withColumnIds(protocol.columns) : defaultColumns.map((col) => ({ ...col }));
    entries = (protocol.entries || []).map((e) => ({
      ...e,
      photoPreview: e.photoBlob ? blobToObjectUrl(e.photoBlob) : ''
    }));

    await clearEntries();
    for (const e of entries) {
      await addEntry({
        id: e.id,
        createdAt: e.createdAt,
        fields: e.fields,
        photoBlob: e.photoBlob ?? null
      });
    }

    isDirty = false;
    editingEntryId = null;
    protocolTitleTouched = false;
    view = 'protocol-view';
  };

  const startEntry = () => {
    editingEntryId = null;
    entryDraft = { fields: {}, photoFile: null, photoPreview: '' };
    stepIndex = 0;
    entrySteps = columns.map((c) => ({ ...c }));
    if (!entrySteps.length) {
      finalizeEntry();
      return;
    }
    view = entrySteps[0].isPhoto ? 'photo' : 'field';
    currentField = entrySteps[0].isPhoto ? null : entrySteps[0];
    if (view === 'field') {
      tick().then(() => entryInputRef?.focus());
    }
  };

  const editEntry = (entry) => {
    editingEntryId = entry.id;
    entryDraft = {
      fields: { ...entry.fields },
      photoFile: entry.photoBlob ?? null,
      photoPreview: entry.photoPreview ?? ''
    };
    stepIndex = 0;
    entrySteps = columns.map((c) => ({ ...c }));
    if (!entrySteps.length) {
      finalizeEntry();
      return;
    }
    view = entrySteps[0].isPhoto ? 'photo' : 'field';
    currentField = entrySteps[0].isPhoto ? null : entrySteps[0];
    if (view === 'field') {
      tick().then(() => entryInputRef?.focus());
    }
  };

  const removeEntryItem = async (entryId) => {
    entries = entries.filter((e) => e.id !== entryId);
    await deleteEntry(entryId);
    isDirty = true;
  };

  const handlePhoto = async (e) => {
    const file = e.currentTarget.files?.[0];
    if (!file) return;
    const compressed = await compressImage(file);
    entryDraft.photoFile = compressed;
    entryDraft.photoPreview = blobToObjectUrl(compressed);
    isDirty = true;
    await goNextStep();
  };

  const currentStep = () => entrySteps[stepIndex];

  const goToStep = (idx) => {
    stepIndex = idx;
    const col = entrySteps[idx];
    view = col?.isPhoto ? 'photo' : 'field';
    currentField = col && !col.isPhoto ? col : null;
    if (view === 'field') {
      tick().then(() => entryInputRef?.focus());
    }
  };

  const goNextStep = async () => {
    if (stepIndex < entrySteps.length - 1) {
      goToStep(stepIndex + 1);
    } else {
      await finalizeEntry();
    }
  };

  const goPrevStep = () => {
    if (stepIndex > 0) {
      goToStep(stepIndex - 1);
    }
  };

  const finalizeEntry = async () => {
    if (isSaving) return;
    isSaving = true;
    saveError = '';

    try {
      const entryId = editingEntryId || fallbackId();
      const snapshot = {
        id: entryId,
        createdAt: editingEntryId ? entryDraft.createdAt || new Date().toISOString() : new Date().toISOString(),
        fields: { ...entryDraft.fields },
        photoBlob: entryDraft.photoFile ?? null
      };

      await addEntry(snapshot);

      if (editingEntryId) {
        entries = entries.map((e) =>
          e.id === editingEntryId
            ? { ...snapshot, photoPreview: snapshot.photoBlob ? blobToObjectUrl(snapshot.photoBlob) : '' }
            : e
        );
      } else {
        entries = [
          {
            ...snapshot,
            photoPreview: snapshot.photoBlob ? blobToObjectUrl(snapshot.photoBlob) : ''
          },
          ...entries
        ];
      }

      isDirty = true;
      entryDraft = { fields: {}, photoFile: null, photoPreview: '' };
      editingEntryId = null;
      stepIndex = 0;
      entrySteps = [];
      currentField = null;
      view = 'main';
    } catch (err) {
      saveError = 'Speichern fehlgeschlagen. Bitte erneut versuchen.';
      console.error(err);
    } finally {
      isSaving = false;
    }
  };

  function fallbackId() {
    return `entry_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  const buildProtocolRecord = () => {
    const now = new Date().toISOString();
    return {
      id: activeProtocolId || `protocol_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      createdAt: activeProtocolCreatedAt || now,
      updatedAt: now,
      protocolTitle: protocolTitle || '',
      projectName: projectName || '',
      protocolDate: protocolDate || today(),
      protocolDescription: protocolDescription || '',
      attendees: attendees || '',
      columns: columns.map((c) => ({ ...c })),
      entries: entries.map((e) => ({
        id: e.id,
        createdAt: e.createdAt,
        fields: e.fields,
        photoBlob: e.photoBlob ?? null
      }))
    };
  };

  const toExportFeedback = (label, result) => {
    if (!result) return `${label}-Export nicht verfügbar.`;
    const stats = result.stats;
    if (!stats) return `${label} exportiert.`;
    const requested = Number(stats.requestedEntries ?? 0);
    const exported = Number(stats.exportedEntries ?? requested);
    const issues = Array.isArray(stats.issues) ? stats.issues.filter(Boolean) : [];
    if (requested > exported) {
      const reason = issues[0] || 'Unbekannter Fehler bei einzelnen Einträgen.';
      return `${label}: ${exported}/${requested} Einträge exportiert. Grund: ${reason}`;
    }
    if (issues.length > 0) {
      return `${label}: ${exported}/${requested} Einträge exportiert. Hinweis: ${issues[0]}`;
    }
    return `${label}: ${exported}/${requested} Einträge exportiert.`;
  };

  const showExportFeedback = (label, result) => {
    const message = toExportFeedback(label, result);
    showToast(message);
    if (result?.stats?.requestedEntries > result?.stats?.exportedEntries || (result?.stats?.issues || []).length > 0) {
      downloadError = message;
    }
  };

  const buildExportPatch = ({ protocolRecord, xlsxResult, pdfResult, now }) => {
    const patch = {
      id: `export_${protocolRecord.id}`,
      protocolId: protocolRecord.id,
      createdAt: protocolRecord.createdAt,
      updatedAt: now,
      projectName: protocolRecord.projectName,
      protocolDate: protocolRecord.protocolDate
    };
    if (xlsxResult) {
      patch.filename = xlsxResult.filename || buildFilename(protocolRecord.projectName, protocolRecord.protocolDate);
      patch.base64 = xlsxResult.base64 || '';
      patch.xlsxStats = xlsxResult.stats || null;
    }
    if (pdfResult) {
      patch.pdfFilename = pdfResult.filename || buildFilename(protocolRecord.projectName, protocolRecord.protocolDate).replace(/\.xlsx$/i, '.pdf');
      patch.pdfBase64 = pdfResult.base64 || '';
      patch.pdfUpdatedAt = now;
      patch.pdfStats = pdfResult.stats || null;
    }
    return patch;
  };

  const saveProtocol = async () => {
    const protocolRecord = buildProtocolRecord();
    await addProtocol(protocolRecord);
    isDirty = false;
    return protocolRecord;
  };

  const saveAndExportProtocol = async ({ format } = {}) => {
    const protocolRecord = await saveProtocol();
    let xlsxResult = null;
    let pdfResult = null;

    if (format === 'xlsx') {
      xlsxResult = await exportToXlsxData({
        protocolTitle: protocolRecord.protocolTitle,
        projectName: protocolRecord.projectName,
        protocolDate: protocolRecord.protocolDate,
        protocolDescription: protocolRecord.protocolDescription,
        attendees: protocolRecord.attendees,
        logoDataUrl,
        columns: protocolRecord.columns,
        entries: protocolRecord.entries
      });
    }
    if (format === 'pdf') {
      pdfResult = await exportToPdfData({
        protocolTitle: protocolRecord.protocolTitle,
        projectName: protocolRecord.projectName,
        protocolDate: protocolRecord.protocolDate,
        protocolDescription: protocolRecord.protocolDescription,
        attendees: protocolRecord.attendees,
        logoDataUrl,
        columns: protocolRecord.columns,
        entries: protocolRecord.entries
      });
    }

    let exportRecord = null;
    if (xlsxResult || pdfResult) {
      const now = new Date().toISOString();
      exportRecord = await upsertExportByProtocol(buildExportPatch({ protocolRecord, xlsxResult, pdfResult, now }));
    }
    return { protocolRecord, exportRecord, xlsxResult, pdfResult };
  };

  const closeProtocol = () => {
    closeError = '';
    if (isExporting) return;

    // If existing protocol and no changes, just return to list without prompt
    if (activeProtocolId && !isDirty) {
      resetProtocol();
      view = 'protocols';
      return;
    }

    confirmDialog = {
      open: true,
      title: 'Vorgang abschließen',
      message: 'Wie möchtest du den Export herunterladen?',
      primaryLabel: 'Excel herunterladen',
      secondaryLabel: 'PDF herunterladen',
      tertiaryLabel: 'Nur speichern',
      showCancel: true,
      secondaryDanger: false,
      onPrimary: async () => {
        if (isExporting) return;
        isExporting = true;
        try {
          const { exportRecord } = await saveAndExportProtocol({ format: 'xlsx' });
          protocolsList = await listProtocols();
          exportsList = await listExports();
          if (exportRecord) await downloadExportExcel(exportRecord);
          await resetProtocol();
          view = 'protocols';
          closeConfirm();
        } catch (err) {
          closeError = 'Abschluss fehlgeschlagen. Bitte erneut versuchen.';
          console.error(err);
        } finally {
          isExporting = false;
        }
      },
      onSecondary: async () => {
        if (isExporting) return;
        isExporting = true;
        try {
          const { exportRecord } = await saveAndExportProtocol({ format: 'pdf' });
          protocolsList = await listProtocols();
          exportsList = await listExports();
          if (exportRecord) await downloadExportPdf(exportRecord);
          await resetProtocol();
          view = 'protocols';
          closeConfirm();
        } catch (err) {
          closeError = 'Abschluss fehlgeschlagen. Bitte erneut versuchen.';
          console.error(err);
        } finally {
          isExporting = false;
        }
      },
      onTertiary: async () => {
        if (isExporting) return;
        isExporting = true;
        try {
          await saveProtocol();
          protocolsList = await listProtocols();
          exportsList = await listExports();
          showToast('Gespeichert');
          await resetProtocol();
          view = 'protocols';
          closeConfirm();
        } catch (err) {
          closeError = 'Abschluss fehlgeschlagen. Bitte erneut versuchen.';
          console.error(err);
        } finally {
          isExporting = false;
        }
      }
    };
  };

  const resetProtocol = async () => {
    await clearEntries();
    await clearSettings();
    entries = [];
    protocolTitle = '';
    protocolTitleTouched = false;
    projectName = '';
    protocolDate = today();
    protocolDescription = '';
    attendees = '';
    columns = defaultColumns.map((col) => ({ ...col }));
    activeProtocolId = null;
    activeProtocolCreatedAt = null;
    isDirty = false;
    view = 'start';
  };

  const cancelProtocol = () => {
    if (activeProtocolId && !isDirty) {
      resetProtocol();
      return;
    }
    confirmDialog = {
      open: true,
      title: 'Protokoll verlassen',
      message: 'Möchtest du die aktuellen Daten speichern oder verwerfen?',
      primaryLabel: 'Speichern',
      secondaryLabel: 'Verwerfen',
      tertiaryLabel: '',
      showCancel: true,
      secondaryDanger: true,
      onPrimary: async () => {
        await saveProtocol();
        protocolsList = await listProtocols();
        exportsList = await listExports();
        await resetProtocol();
        view = 'protocols';
        isDirty = false;
        closeConfirm();
      },
      onSecondary: async () => {
        await resetProtocol();
        closeConfirm();
      }
    };
  };

  const showToast = (message) => {
    toastMessage = message;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastMessage = '';
    }, 2000);
  };

  const base64ToUint8Array = (base64) => {
    const clean = String(base64 || '').replace(/\s+/g, '');
    const chunkSize = 32768; // multiple of 4 for safe base64 slicing
    const chunks = [];
    let total = 0;
    for (let offset = 0; offset < clean.length; offset += chunkSize) {
      const slice = clean.slice(offset, offset + chunkSize);
      const byteString = atob(slice);
      const bytes = new Uint8Array(byteString.length);
      for (let i = 0; i < byteString.length; i += 1) {
        bytes[i] = byteString.charCodeAt(i);
      }
      chunks.push(bytes);
      total += bytes.length;
    }
    const merged = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) {
      merged.set(chunk, position);
      position += chunk.length;
    }
    return merged;
  };

  const closeConfirm = () => {
    confirmDialog = {
      open: false,
      title: '',
      message: '',
      primaryLabel: '',
      secondaryLabel: '',
      tertiaryLabel: '',
      showCancel: true,
      secondaryDanger: false,
      onPrimary: null,
      onSecondary: null,
      onTertiary: null
    };
  };

  const goToProtocols = async () => {
    protocolsList = await listProtocols();
    selectionModeProtocols = false;
    selectedProtocols = new Set();
    view = 'protocols';
  };

  const goToExports = async () => {
    exportsList = await listExports();
    selectionModeExports = false;
    selectedExports = new Set();
    view = 'exports';
  };

  const goToStart = () => {
    view = 'landing';
  };

  const openDownloadDialog = ({ title, onExcel, onPdf }) => {
    downloadDialog = { open: true, title, onExcel, onPdf };
  };

  const closeDownloadDialog = () => {
    downloadDialog = { open: false, title: '', onExcel: null, onPdf: null };
  };

  const downloadFileFromBase64 = async ({ base64, filename, mimeType }) => {
    if (!base64) {
      downloadError = 'Download nicht verfügbar.';
      return;
    }
    downloadError = '';

    const native = isNativePlatform();
    const nativePlatform = native ? getNativePlatform() : 'web';
    const isIosWebClient = () => {
      const ua = navigator?.userAgent || '';
      const platform = navigator?.platform || '';
      const touchPoints = Number(navigator?.maxTouchPoints || 0);
      return /iPad|iPhone|iPod/i.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
    };

    if (nativePlatform === 'ios') {
      try {
        const uri = await saveBase64File({ filename, base64Data: base64 });
        await shareFile({
          uri,
          title: filename,
          text: 'Baustellen-Protokoll',
          dialogTitle: 'Datei teilen'
        });
        return;
      } catch (err) {
        console.error(err);
        // Fall back to browser flow below for environments where native sharing is unavailable.
      }
    } else if (nativePlatform === 'android') {
      try {
        await saveBase64File({ filename, base64Data: base64 });
        showToast(`${filename} gespeichert`);
        return;
      } catch (err) {
        console.error(err);
        // Fall back to browser flow below.
      }
    }

    let blob;
    try {
      blob = new Blob([base64ToUint8Array(base64)], { type: mimeType });
    } catch (err) {
      downloadError = `Datei konnte nicht decodiert werden: ${err?.message || 'Unbekannt'}`;
      return;
    }

    let shared = false;
    const shouldUseWebShare = !native && isIosWebClient() && !!navigator?.share;
    if (shouldUseWebShare) {
      try {
        const file = new File([blob], filename, { type: blob.type });
        if (!navigator?.canShare || navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: filename, text: 'Baustellen-Protokoll' });
          shared = true;
        }
      } catch (err) {
        if (err?.name !== 'NotAllowedError') console.error(err);
      }
    }

    const url = URL.createObjectURL(blob);
    if (shared) {
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      return;
    }

    try {
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      anchor.rel = 'noopener';
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    } catch {
      // Fallback for environments that block synthetic download clicks.
      window.open(url, '_blank', 'noopener');
    } finally {
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  };

  const ensureExcelExport = async (protocol) => {
    if (!protocol) return { record: null, result: null };
    const xlsxResult = await exportToXlsxData({
      protocolTitle: protocol.protocolTitle,
      projectName: protocol.projectName,
      protocolDate: protocol.protocolDate,
      protocolDescription: protocol.protocolDescription,
      attendees: protocol.attendees,
      logoDataUrl,
      columns: protocol.columns,
      entries: protocol.entries
    });
    if (!xlsxResult) return { record: null, result: null };
    const now = new Date().toISOString();
    const record = await upsertExportByProtocol(
      buildExportPatch({
        protocolRecord: protocol,
        xlsxResult,
        pdfResult: null,
        now
      })
    );
    return { record, result: xlsxResult };
  };

  const downloadExportExcel = async (exp, protocol) => {
    let target = exp;
    let xlsxResult = null;
    if (!target?.base64) {
      const protocolRecord = protocol || (exp?.protocolId ? await getProtocol(exp.protocolId) : null);
      if (!protocolRecord) {
        downloadError = 'Download nicht verfügbar.';
        return;
      }
      const generated = await ensureExcelExport(protocolRecord);
      target = generated.record;
      xlsxResult = generated.result;
      exportsList = await listExports();
    }
    if (!target?.base64) {
      downloadError = 'Download nicht verfügbar.';
      return;
    }
    const filename = target.filename || buildFilename(target.projectName, target.protocolDate);
    await downloadFileFromBase64({
      base64: target.base64,
      filename,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    if (xlsxResult) {
      showExportFeedback('Excel', xlsxResult);
    } else if (target.xlsxStats) {
      showExportFeedback('Excel', { stats: target.xlsxStats });
    }
  };

  const ensurePdfExport = async (protocol) => {
    if (!protocol) return { record: null, result: null };
    const pdfResult = await exportToPdfData({
      protocolTitle: protocol.protocolTitle,
      projectName: protocol.projectName,
      protocolDate: protocol.protocolDate,
      protocolDescription: protocol.protocolDescription,
      attendees: protocol.attendees,
      logoDataUrl,
      columns: protocol.columns,
      entries: protocol.entries
    });
    if (!pdfResult) return { record: null, result: null };
    const now = new Date().toISOString();
    const record = await upsertExportByProtocol(
      buildExportPatch({
        protocolRecord: protocol,
        xlsxResult: null,
        pdfResult,
        now
      })
    );
    return { record, result: pdfResult };
  };

  const downloadExportPdf = async (exp, protocol) => {
    let target = exp;
    let pdfResult = null;
    if (!target?.pdfBase64) {
      const protocolRecord = protocol || (exp?.protocolId ? await getProtocol(exp.protocolId) : null);
      if (!protocolRecord) {
        downloadError = 'Download nicht verfügbar.';
        return;
      }
      const generated = await ensurePdfExport(protocolRecord);
      target = generated.record;
      pdfResult = generated.result;
      exportsList = await listExports();
    }
    if (!target?.pdfBase64) {
      downloadError = 'Download nicht verfügbar.';
      return;
    }
    const filename =
      target.pdfFilename || buildFilename(target.projectName, target.protocolDate).replace(/\.xlsx$/i, '.pdf');
    await downloadFileFromBase64({ base64: target.pdfBase64, filename, mimeType: 'application/pdf' });
    if (pdfResult) {
      showExportFeedback('PDF', pdfResult);
    } else if (target.pdfStats) {
      showExportFeedback('PDF', { stats: target.pdfStats });
    }
  };

  const downloadProtocolExport = async (protocol) => {
    let exp = exportsList.find((e) => e.protocolId === protocol.id);
    if (!exp) {
      const generated = await ensureExcelExport(protocol);
      if (generated.record) {
        exp = generated.record;
        exportsList = await listExports();
      }
    }
    if (exp) {
      await downloadExportExcel(exp, protocol);
    }
  };

  const downloadProtocolPdf = async (protocol) => {
    let exp = exportsList.find((e) => e.protocolId === protocol.id);
    if (!exp?.pdfBase64) {
      const generated = await ensurePdfExport(protocol);
      if (generated.record) {
        exp = generated.record;
        exportsList = await listExports();
      }
    }
    if (exp?.pdfBase64) {
      await downloadExportPdf(exp, protocol);
    }
  };


  const toggleProtocolsSelection = (id) => {
    const next = new Set(selectedProtocols);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedProtocols = next;
  };

  const toggleExportsSelection = (id) => {
    const next = new Set(selectedExports);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    selectedExports = next;
  };

  const toggleSelectionModeProtocols = () => {
    selectionModeProtocols = !selectionModeProtocols;
    if (!selectionModeProtocols) {
      selectedProtocols = new Set();
    }
  };

  const toggleSelectionModeExports = () => {
    selectionModeExports = !selectionModeExports;
    if (!selectionModeExports) {
      selectedExports = new Set();
    }
  };

  const selectAllProtocols = () => {
    selectedProtocols = new Set(protocolsList.map((p) => p.id));
  };

  const selectAllExports = () => {
    selectedExports = new Set(exportsList.map((e) => e.id));
  };

  const downloadSelectedProtocols = async () => {
    if (selectedProtocols.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    openDownloadDialog({
      title: 'Auswahl herunterladen',
      onExcel: async () => {
        for (const protocol of protocolsList.filter((p) => selectedProtocols.has(p.id))) {
          await downloadProtocolExport(protocol);
        }
        closeDownloadDialog();
      },
      onPdf: async () => {
        for (const protocol of protocolsList.filter((p) => selectedProtocols.has(p.id))) {
          await downloadProtocolPdf(protocol);
        }
        closeDownloadDialog();
      }
    });
  };

  const downloadSelectedExports = async () => {
    if (selectedExports.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    openDownloadDialog({
      title: 'Auswahl herunterladen',
      onExcel: async () => {
        for (const exp of exportsList.filter((e) => selectedExports.has(e.id))) {
          await downloadExportExcel(exp);
        }
        closeDownloadDialog();
      },
      onPdf: async () => {
        for (const exp of exportsList.filter((e) => selectedExports.has(e.id))) {
          await downloadExportPdf(exp);
        }
        closeDownloadDialog();
      }
    });
  };

  const deleteSelectedProtocols = async () => {
    if (selectedProtocols.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    const ok = window.confirm('Ausgewählte Vorgänge wirklich löschen?');
    if (!ok) return;
    for (const protocol of protocolsList.filter((p) => selectedProtocols.has(p.id))) {
      await deleteProtocol(protocol.id);
    }
    protocolsList = await listProtocols();
    exportsList = await listExports();
    selectedProtocols = new Set();
    selectionModeProtocols = false;
  };

  const deleteSelectedExports = async () => {
    if (selectedExports.size === 0) {
      downloadError = 'Keine Auswahl getroffen.';
      return;
    }
    const ok = window.confirm('Ausgewählte Exporte wirklich löschen?');
    if (!ok) return;
    for (const exp of exportsList.filter((e) => selectedExports.has(e.id))) {
      await deleteExport(exp.id);
    }
    exportsList = await listExports();
    selectedExports = new Set();
    selectionModeExports = false;
  };

  function today() {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yyyy = String(now.getFullYear());
    return `${dd}-${mm}-${yyyy}`;
  }

  function buildFilename(name, date) {
    const cleanName = sanitizeFilename(name || 'protokoll');
    const cleanDate = sanitizeFilename(date || today());
    return `${cleanName}_${cleanDate}.xlsx`;
  }

  function sanitizeFilename(value) {
    return String(value).replace(/[^a-z0-9\\-_. ]/gi, '_').trim() || 'protokoll';
  }

  function isPwa() {
    return window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator?.standalone;
  }

</script>

<svelte:window on:pointermove={movePointerDrag} on:pointerup={endPointerDrag} on:pointercancel={endPointerDrag} />
  <div class:dragging-page={dragState.active} class="page">
  {#if dragState.active}
    <div
      class="drag-ghost"
      style={`width: ${dragState.width}px; height: ${dragState.height}px; transform: translate3d(${dragState.x}px, ${dragState.y}px, 0);`}
    >
      <span class="drag-handle ghost" aria-hidden="true">⋮⋮</span>
      <div class="col-title">{dragState.label}</div>
      <div class="col-meta">Spalte verschieben</div>
    </div>
  {/if}
  {#if updateAvailable}
    <div class="update-banner">
      <span>Neue Version verfügbar.</span>
      <button type="button" class="primary" on:click={() => location.reload()}>Aktualisieren</button>
    </div>
  {/if}
  <header class="hero">
    <div>
      <p class="eyebrow">Baustellen Tool</p>
      <h1>SiteReport</h1>
      <p class="sub">Schrittweise Dokumentation mit Foto und XLSX-Export.</p>
    </div>
    {#if view === 'start' || view === 'edit-setup'}
      <button class="toolbox-link" type="button" on:click={() => (view = 'landing')}>Zur Startseite</button>
    {:else if view === 'landing'}
      <a class="toolbox-link" href="/baustellen-tools/">Zur Toolbox</a>
    {/if}
  </header>

  {#if view === 'landing'}
    <section class="panel landing">
      <h2>Protokoll starten</h2>
      <p class="muted">Lege einen neuen Vorgang an oder öffne bestehende Protokolle.</p>
      <div class="cta-row">
        <button class="primary full-width" type="button" on:click={startNewProtocolSetup}>
          Neues Protokoll starten
        </button>
      </div>
      <div class="cta-row split">
        <button type="button" on:click={goToProtocols}>Protokolle anzeigen</button>
        <button type="button" on:click={goToExports}>Exports anzeigen</button>
      </div>
    </section>
  {/if}

  {#if view === 'start' || view === 'edit-setup'}
    <section class="panel">
      <h2>{view === 'edit-setup' ? 'Vorgang bearbeiten' : 'Protokoll erstellen'}</h2>
      <div class="section">
        <h3>Stammdaten</h3>
        <label class="field">
          <span>Protokoll-Name</span>
          <input
            bind:value={protocolTitle}
            placeholder="z. B. Tagesprotokoll Baustelle"
            class:field-error={protocolTitleTouched && !protocolTitle.trim()}
            on:input={() => {
              isDirty = true;
              protocolTitleTouched = true;
              if (protocolTitle.trim()) saveError = '';
            }}
          />
        </label>
        <label class="field">
          <span>Projektname</span>
          <input bind:value={projectName} placeholder="Trag den Projektnamen ein" on:input={() => (isDirty = true)} />
        </label>

        <label class="field">
          <span>Beschreibung</span>
          <input
            type="text"
            placeholder="Kurzbeschreibung"
            bind:value={protocolDescription}
            on:input={() => (isDirty = true)}
          />
        </label>

        <label class="field">
          <span>Anwesende Personen</span>
          <input
            type="text"
            placeholder="z. B. Max Mustermann, Bauleitung"
            bind:value={attendees}
            on:input={() => (isDirty = true)}
          />
        </label>

        <label class="field">
          <span>Datum</span>
          <div class="readonly-field">{protocolDate}</div>
        </label>

        <div class="field">
          <span>Firmenlogo (optional)</span>
          {#if logoDataUrl}
            <img class="logo-preview" src={logoDataUrl} alt="Firmenlogo" />
            <div class="logo-actions">
              <label class="file-button">
                Logo ändern
                <input type="file" accept="image/*" on:change={handleLogoUpload} />
              </label>
              <button type="button" class="ghost" on:click={removeLogo}>Logo entfernen</button>
            </div>
          {:else}
            <label class="file-button">
              Logo hochladen
              <input type="file" accept="image/*" on:change={handleLogoUpload} />
            </label>
          {/if}
          <span class="muted">Das Logo bleibt gespeichert, bis du es änderst oder entfernst.</span>
        </div>
      </div>

      <div class="section">
        <h3>
          Tabellenformat
          <button
            class="info-button"
            type="button"
            aria-label="Info zum Tabellenformat"
            on:click={() => (showFormatInfo = !showFormatInfo)}
          >
            i
          </button>
        </h3>
        {#if showFormatInfo}
          <div class="info-popover">
            Hier legst du fest, welche Spalten in der Excel-Datei erscheinen. Wähle ein vorhandenes Format oder erstelle
            ein neues. Die Reihenfolge der Spalten bestimmt später die Reihenfolge der Eingaben.
          </div>
        {/if}

        <div class="grid">
          <label class="field">
            <span>Format auswählen</span>
            <select bind:value={selectedTemplateId} on:change={applyTemplate}>
              <option value="">Format auswählen</option>
              {#each templates as tpl}
                <option value={tpl.id}>{tpl.name}</option>
              {/each}
            </select>
            {#if templates.length === 0}
              <span class="muted">Noch kein Format vorhanden. Bitte zuerst erstellen.</span>
            {/if}
          </label>
          <div class="field">
            <span>Neues Format</span>
            <button type="button" on:click={startNewFormat}>Neues Format anlegen</button>
          </div>
        </div>
        {#if selectedTemplateId}
          <div class="format-preview">
            <div class="muted">Tabellenvorschau</div>
            <div class="table-preview">
              <table>
                <thead>
                  <tr>
                    {#each columns as col}
                      <th>{col.name}</th>
                    {/each}
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    {#each columns as col}
                      <td class:cell-number={col.type === 'number'}>
                        {#if col.isPhoto}
                          Foto
                        {:else if col.type === 'number'}
                          123
                        {:else}
                          Beispiel
                        {/if}
                      </td>
                    {/each}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="cta-row">
            <button type="button" on:click={startEditFormat}>Format bearbeiten</button>
          </div>
        {/if}
      </div>

      <div class="cta-row">
        {#if view === 'edit-setup'}
          <button class="primary" type="button" on:click={saveSetup}>Änderungen speichern</button>
          <button type="button" on:click={() => (view = 'main')}>Zurück</button>
        {:else}
          <button class="primary full-width" type="button" on:click={startProtocol} disabled={!selectedTemplateId}>
            Protokoll starten
          </button>
        {/if}
      </div>
      {#if !selectedTemplateId}
        <p class="error">Bitte zuerst ein Tabellenformat auswählen.</p>
      {/if}
      {#if saveError}
        <p class="error">{saveError}</p>
      {/if}
    </section>
  {/if}

  {#if view === 'format-builder'}
    <section class="panel">
      <h2>{formatMode === 'edit' ? 'Format bearbeiten' : 'Neues Tabellenformat'}</h2>
      <p class="muted">
        Lege fest, welche Informationen pro Eintrag abgefragt werden. Die Foto-Spalte ist immer dabei und wird automatisch
        in die Excel übernommen.
      </p>

      {#if formatMode === 'new'}
        <label class="field">
          <span>Formatname</span>
          <input
            class:field-error={formatNameTouched && !templateName.trim()}
            bind:value={templateName}
            placeholder="z. B. Standard Baustelle"
            on:input={() => {
              formatNameTouched = true;
              if (templateName.trim()) formatError = '';
            }}
          />
        </label>
        {#if formatError}
          <p class="error">{formatError}</p>
        {/if}
      {/if}

      <div class="section">
        <h3>Spalten definieren</h3>
        <div class:dragging-list={dragState.active} class="columns">
          {#each columns as col, idx (col.id)}
            {#if dragState.active && dragState.overIndex === idx}
              <div class="col-placeholder" style={`height: ${dragState.height}px;`}></div>
            {/if}
            {#if !(dragState.active && dragState.id === col.id)}
              <div class="col-card" data-index={idx}>
              <button
                class="drag-handle"
                type="button"
                aria-label="Spalte verschieben"
                on:pointerdown|preventDefault={(event) => startPointerDrag(event, idx)}
              >
                ⋮⋮
              </button>
              {#if editingColIndex === idx}
                <div class="edit-col">
                  <input bind:value={editColName} placeholder="Spaltenname" />
                  <select bind:value={editColType} disabled={col.isPhoto}>
                    <option value="text">Text</option>
                    <option value="number">Zahl</option>
                  </select>
                  <div class="edit-actions">
                    <button class="primary" type="button" on:click={saveEditColumn}>Speichern</button>
                    <button type="button" on:click={cancelEditColumn}>Abbrechen</button>
                  </div>
                </div>
              {:else}
                <div class="col-title">{col.name}</div>
                <div class="col-meta">Typ: {col.type}</div>
                <div class="col-actions">
                  <button type="button" on:click={() => startEditColumn(idx)}>Bearbeiten</button>
                  {#if !col.isPhoto}
                    <button type="button" on:click={() => removeColumn(col.id)}>Spalte entfernen</button>
                  {:else}
                    <span class="photo-pill">Foto-Spalte</span>
                  {/if}
                </div>
              {/if}
            </div>
            {/if}
          {/each}
          {#if dragState.active && dragState.overIndex === columns.length}
            <div class="col-placeholder" style={`height: ${dragState.height}px;`}></div>
          {/if}
        </div>

        <div class="add-row">
          <input bind:value={newColName} placeholder="Spaltenname" />
          <select bind:value={newColType}>
            <option value="text">Text</option>
            <option value="number">Zahl</option>
          </select>
          <button type="button" on:click={addColumn}>Spalte hinzufügen</button>
        </div>
      </div>

      <div class="cta-row">
        {#if formatMode === 'edit'}
          <button class="primary" type="button" on:click={saveEditedFormat}>Änderungen speichern</button>
        {:else}
          <button class="primary" type="button" on:click={saveTemplate}>
            Format speichern
          </button>
        {/if}
        <button type="button" on:click={cancelFormatEdit}>Abbrechen</button>
      </div>
    </section>
  {/if}

  {#if view === 'main'}
    <section class="panel">
      <h2>{protocolTitle || projectName || 'Protokoll'}</h2>
      <div class="summary">
        <div>
          <div class="label">Protokoll-Name</div>
          <div>{protocolTitle || '—'}</div>
        </div>
        <div>
          <div class="label">Datum</div>
          <div>{protocolDate}</div>
        </div>
        <div>
          <div class="label">Beschreibung</div>
          <div>{protocolDescription || '—'}</div>
        </div>
        <div>
          <div class="label">Anwesende Personen</div>
          <div>{attendees || '—'}</div>
        </div>
        <div>
          <div class="label">Einträge</div>
          <div>{entries.length}</div>
        </div>
      </div>

      <div class="cta-row">
        <button class="primary" type="button" on:click={startEntry}>Eintrag machen</button>
        <button type="button" on:click={() => (view = 'edit-setup')}>Stammdaten bearbeiten</button>
        <button type="button" disabled={isExporting} on:click={closeProtocol}>
          {isExporting ? 'Abschließen…' : 'Protokoll abschließen'}
        </button>
        <button type="button" on:click={cancelProtocol}>Protokoll verlassen</button>
      </div>
      {#if closeError}
        <p class="error">{closeError}</p>
      {/if}

      <div class="entries">
        {#if entries.length === 0}
          <p class="muted">Noch keine Einträge.</p>
        {:else}
          {#each entries as e}
            <div class="entry-card">
              {#if e.photoPreview}
                <img src={e.photoPreview} alt="Foto" />
              {/if}
              <div class="entry-body">
                <div class="entry-date">{new Date(e.createdAt).toLocaleString()}</div>
                <div class="entry-fields">
                  {#each Object.entries(e.fields) as [key, value]}
                    <div><strong>{key}:</strong> {value}</div>
                  {/each}
                </div>
                <div class="entry-actions">
                  <button type="button" on:click={() => editEntry(e)}>Bearbeiten</button>
                  <button type="button" class="danger" on:click={() => removeEntryItem(e.id)}>Löschen</button>
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  {#if view === 'protocol-view'}
    <section class="panel">
      <h2>{protocolTitle || projectName || 'Protokoll'}</h2>
      <div class="summary">
        <div>
          <div class="label">Protokoll-Name</div>
          <div>{protocolTitle || '—'}</div>
        </div>
        <div>
          <div class="label">Datum</div>
          <div>{protocolDate}</div>
        </div>
        <div>
          <div class="label">Beschreibung</div>
          <div>{protocolDescription || '—'}</div>
        </div>
        <div>
          <div class="label">Anwesende Personen</div>
          <div>{attendees || '—'}</div>
        </div>
        <div>
          <div class="label">Einträge</div>
          <div>{entries.length}</div>
        </div>
      </div>

      <div class="cta-row">
        <button class="primary" type="button" on:click={() => (view = 'main')}>Bearbeiten</button>
        <button
          type="button"
          on:click={() =>
            openDownloadDialog({
              title: 'Download',
              onExcel: async () => {
                await downloadProtocolExport(buildProtocolRecord());
                closeDownloadDialog();
              },
              onPdf: async () => {
                await downloadProtocolPdf(buildProtocolRecord());
                closeDownloadDialog();
              }
            })}
        >
          Download
        </button>
        <button type="button" on:click={goToProtocols}>Zurück</button>
      </div>

      <div class="entries">
        {#if entries.length === 0}
          <p class="muted">Noch keine Einträge.</p>
        {:else}
          {#each entries as e}
            <div class="entry-card">
              {#if e.photoPreview}
                <img src={e.photoPreview} alt="Foto" />
              {/if}
              <div class="entry-body">
                <div class="entry-date">{new Date(e.createdAt).toLocaleString()}</div>
                <div class="entry-fields">
                  {#each Object.entries(e.fields) as [key, value]}
                    <div><strong>{key}:</strong> {value}</div>
                  {/each}
                </div>
              </div>
            </div>
          {/each}
        {/if}
      </div>
    </section>
  {/if}

  {#if view === 'photo'}
    <section class="panel">
      <h2>Bild hinzufügen</h2>
      <label class="field">
        <span>Kamera öffnen / Datei auswählen</span>
        <input type="file" accept="image/*" on:change={handlePhoto} />
      </label>

      {#if entryDraft.photoPreview}
        <img class="preview" src={entryDraft.photoPreview} alt="Vorschau" />
      {/if}

      <div class="cta-row">
        <button type="button" on:click={goPrevStep} disabled={stepIndex === 0}>Zurück</button>
        <button type="button" on:click={() => (view = 'main')}>Abbrechen</button>
        <button class="primary" type="button" on:click={goNextStep}>
          {stepIndex < entrySteps.length - 1 ? 'Weiter' : 'Speichern'}
        </button>
      </div>
    </section>
  {/if}

  {#if view === 'field'}
    <section class="panel">
      <h2>Eintrag</h2>
      {#if currentField}
        {#key currentField.id}
          <label class="field">
            <span>{currentField.name}</span>
            {#if currentField.type === 'number'}
              <input
                type="number"
                placeholder={currentField.name}
                bind:value={entryDraft.fields[currentField.name]}
                on:input={() => (isDirty = true)}
                bind:this={entryInputRef}
              />
            {:else}
              <input
                type="text"
                placeholder={currentField.name}
                bind:value={entryDraft.fields[currentField.name]}
                on:input={() => (isDirty = true)}
                bind:this={entryInputRef}
              />
            {/if}
          </label>
        {/key}
      {/if}

      <div class="cta-row">
        <button type="button" on:click={goPrevStep} disabled={stepIndex === 0}>Zurück</button>
        <button type="button" on:click={() => (view = 'main')}>Abbrechen</button>
        <button class="primary" type="button" disabled={isSaving} on:click={goNextStep}>
          {stepIndex < entrySteps.length - 1 ? 'Weiter' : 'Speichern'}
        </button>
      </div>
      {#if saveError}
        <p class="error">{saveError}</p>
      {/if}
    </section>
  {/if}

  {#if view === 'protocols'}
    <section class="panel">
      <h2>Protokolle</h2>
      {#if protocolsList.length === 0}
        <p class="muted">Noch keine Protokolle vorhanden.</p>
      {:else}
        <div class="exports">
          {#each protocolsList as protocol}
            <div class="export-card">
              {#if selectionModeProtocols}
                <label class="export-select">
                  <input
                    type="checkbox"
                    checked={selectedProtocols.has(protocol.id)}
                    on:change={() => toggleProtocolsSelection(protocol.id)}
                  />
                </label>
              {/if}
              <div class="export-info">
                <div class="export-name">{protocol.projectName || 'Ohne Namen'}</div>
                <div class="export-meta">
                  {protocol.protocolDate} · {protocol.protocolDescription || '—'} · {protocol.entries?.length || 0} Einträge
                </div>
              </div>
              <div class="export-actions">
                <button type="button" on:click={() => openProtocol(protocol.id)}>Öffnen</button>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if protocolsList.length > 0}
        <div class="cta-row">
          <button type="button" on:click={toggleSelectionModeProtocols}>
            {selectionModeProtocols ? 'Auswahl beenden' : 'Auswählen'}
          </button>
          {#if selectionModeProtocols}
            <button type="button" on:click={downloadSelectedProtocols}>Auswahl herunterladen</button>
            <button type="button" on:click={selectAllProtocols}>Alle auswählen</button>
            <button type="button" class="danger" on:click={deleteSelectedProtocols}>Löschen</button>
          {/if}
        </div>
      {/if}
      <div class="cta-row">
        <button type="button" on:click={goToStart}>Zur Startseite</button>
        <button type="button" on:click={goToExports}>Exports anzeigen</button>
      </div>
    </section>
  {/if}

  {#if view === 'exports'}
    <section class="panel">
      <h2>Exports</h2>
      {#if exportsList.length === 0}
        <p class="muted">Noch keine Exporte vorhanden.</p>
      {:else}
        <div class="exports">
          {#each exportsList as exp}
            <div
              class:clickable={!selectionModeExports}
              class="export-card"
              on:click={() => {
                if (selectionModeExports) return;
                openDownloadDialog({
                  title: 'Download',
                  onExcel: async () => {
                    await downloadExportExcel(exp);
                    closeDownloadDialog();
                  },
                  onPdf: async () => {
                    await downloadExportPdf(exp);
                    closeDownloadDialog();
                  }
                });
              }}
            >
              {#if selectionModeExports}
                <label class="export-select">
                  <input
                    type="checkbox"
                    checked={selectedExports.has(exp.id)}
                    on:change={() => toggleExportsSelection(exp.id)}
                    on:click|stopPropagation
                  />
                </label>
              {/if}
              <div class="export-info">
                <div class="export-name">{exp.projectName || 'Ohne Namen'}</div>
                <div class="export-meta">
                  {new Date(exp.updatedAt || exp.createdAt).toLocaleString()} · {exp.projectName} · {exp.protocolDate}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {/if}
      {#if downloadError}
        <p class="error">{downloadError}</p>
      {/if}
      {#if exportsList.length > 0}
        <div class="cta-row">
          <button type="button" on:click={toggleSelectionModeExports}>
            {selectionModeExports ? 'Auswahl beenden' : 'Auswählen'}
          </button>
          {#if selectionModeExports}
            <button type="button" on:click={downloadSelectedExports}>Auswahl herunterladen</button>
            <button type="button" on:click={selectAllExports}>Alle auswählen</button>
            <button type="button" class="danger" on:click={deleteSelectedExports}>Löschen</button>
          {/if}
        </div>
      {/if}
      <div class="cta-row">
        <button type="button" on:click={goToStart}>Zur Startseite</button>
        <button type="button" on:click={goToProtocols}>Protokolle anzeigen</button>
      </div>
    </section>
  {/if}

  {#if confirmDialog.open}
    <div class="modal-backdrop" on:click={closeConfirm}></div>
    <div class="modal">
      <h3>{confirmDialog.title}</h3>
      <p class="muted">{confirmDialog.message}</p>
      <div class="cta-row">
        <button class="primary" type="button" on:click={confirmDialog.onPrimary}>
          {confirmDialog.primaryLabel || 'OK'}
        </button>
        <button
          class:danger={confirmDialog.secondaryDanger}
          class:primary={!confirmDialog.secondaryDanger}
          type="button"
          on:click={confirmDialog.onSecondary}
        >
          {confirmDialog.secondaryLabel}
        </button>
        {#if confirmDialog.tertiaryLabel}
          <button type="button" on:click={confirmDialog.onTertiary}>{confirmDialog.tertiaryLabel}</button>
        {/if}
        {#if confirmDialog.showCancel}
          <button type="button" on:click={closeConfirm}>Abbrechen</button>
        {/if}
      </div>
    </div>
  {/if}

  {#if downloadDialog.open}
    <div class="modal-backdrop" on:click={closeDownloadDialog}></div>
    <div class="modal">
      <h3>{downloadDialog.title}</h3>
      <p class="muted">Welches Format möchtest du herunterladen?</p>
      <div class="cta-row">
        <button class="primary" type="button" on:click={downloadDialog.onExcel}>Excel herunterladen</button>
        <button class="primary" type="button" on:click={downloadDialog.onPdf}>PDF herunterladen</button>
        <button type="button" on:click={closeDownloadDialog}>Abbrechen</button>
      </div>
    </div>
  {/if}

  {#if toastMessage}
    <div class="toast">{toastMessage}</div>
  {/if}
</div>

<style>
  .page {
    max-width: 980px;
    margin: 0 auto;
    padding: 32px 20px 80px;
  }

  .hero {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    margin-bottom: 28px;
  }

  .eyebrow {
    text-transform: uppercase;
    font-size: 12px;
    letter-spacing: 0.14em;
    color: var(--muted);
    margin: 0 0 6px;
  }

  h1 {
    margin: 0 0 8px;
    font-size: 38px;
  }

  h3 {
    margin-top: 12px;
  }

  .sub {
    margin: 0;
    color: var(--muted);
  }

  .toolbox-link {
    border: 1px solid var(--border);
    padding: 8px 12px;
    border-radius: 999px;
    text-decoration: none;
    color: var(--ink);
    font-weight: 600;
    background: #fff;
  }

  .panel {
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px;
    margin-bottom: 20px;
    box-shadow: 0 12px 30px rgba(23, 21, 18, 0.08);
  }

  .section {
    border: 1px dashed var(--border);
    border-radius: 14px;
    padding: 14px;
    margin: 14px 0;
    background: #fff;
  }

  .update-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: #fff7ed;
    color: #7c2d12;
    margin-bottom: 16px;
    font-weight: 600;
  }

  .landing {
    text-align: left;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  input, select {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    font-size: 14px;
  }

  .readonly-field {
    padding: 10px 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: #f8f5f1;
    font-size: 14px;
    color: var(--ink);
    user-select: none;
  }

  button {
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: white;
    cursor: pointer;
    font-weight: 600;
  }

  button.primary {
    background: var(--accent);
    color: white;
    border-color: var(--accent);
  }

  .full-width {
    width: 100%;
    justify-content: center;
  }

  button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .columns {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 12px;
    margin: 12px 0 16px;
  }

  .col-card {
    padding: 12px;
    border: 1px dashed var(--border);
    border-radius: 12px;
    background: #ffffff;
    display: flex;
    flex-direction: column;
    gap: 8px;
    cursor: grab;
    position: relative;
    transition: transform 0.18s ease, box-shadow 0.18s ease;
    touch-action: none;
  }

  .col-card:active {
    cursor: grabbing;
  }

  .dragging-list {
    touch-action: none;
    user-select: none;
  }

  .dragging-page {
    overflow: hidden;
  }

  .drag-ghost {
    position: fixed;
    left: 0;
    top: 0;
    z-index: 30;
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 16px 30px rgba(0, 0, 0, 0.12);
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    pointer-events: none;
  }

  .col-placeholder {
    border: 2px dashed var(--border);
    border-radius: 12px;
    background: #f5f2ed;
  }

  .col-card.dragging {
    opacity: 0.95;
    border-style: solid;
    box-shadow: 0 16px 30px rgba(0, 0, 0, 0.12);
    pointer-events: none;
  }

  .drag-handle {
    position: absolute;
    top: 10px;
    right: 12px;
    color: var(--muted);
    font-size: 18px;
    letter-spacing: -2px;
    background: transparent;
    border: none;
    padding: 0;
    line-height: 1;
    cursor: grab;
    touch-action: none;
  }

  .drag-handle.ghost {
    position: static;
    align-self: flex-end;
    margin-bottom: -6px;
    cursor: default;
  }

  .col-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .edit-col {
    display: grid;
    gap: 8px;
  }

  .edit-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .col-title {
    font-weight: 700;
  }

  .col-meta {
    color: var(--muted);
    font-size: 13px;
  }

  .photo-pill {
    display: inline-flex;
    align-items: center;
    padding: 4px 10px;
    border-radius: 999px;
    background: #eef2ff;
    color: var(--accent-2);
    font-size: 12px;
    font-weight: 600;
  }

  .format-preview {
    margin-top: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
  }

  .table-preview {
    margin-top: 10px;
    border: 1px solid var(--border);
    border-radius: 10px;
    overflow-x: auto;
    overflow-y: hidden;
    background: #faf7f2;
  }

  .table-preview table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
    min-width: max-content;
  }

  .table-preview th,
  .table-preview td {
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    border-right: 1px solid var(--border);
    text-align: left;
  }

  .table-preview th:last-child,
  .table-preview td:last-child {
    border-right: none;
  }

  .table-preview thead th {
    background: #f1ede7;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
  }

  .table-preview tbody tr:last-child td {
    border-bottom: none;
  }

  .cell-number {
    text-align: center;
  }

  .add-row {
    display: grid;
    grid-template-columns: 1fr 150px 200px;
    gap: 10px;
  }

  .summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 12px;
    margin-bottom: 12px;
  }

  .label {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--muted);
  }

  .info-button {
    margin-left: 8px;
    width: 20px;
    height: 20px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: #fff;
    color: var(--muted);
    font-size: 12px;
    line-height: 1;
    padding: 0;
  }

  .info-button:hover {
    color: var(--ink);
    border-color: var(--ink);
  }

  .info-popover {
    margin-top: 8px;
    padding: 10px 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: #fff;
    color: var(--ink);
    font-size: 13px;
    box-shadow: 0 8px 18px rgba(0, 0, 0, 0.08);
  }

  .toast {
    position: fixed;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    padding: 8px 14px;
    border-radius: 999px;
    background: #1f2937;
    color: white;
    font-size: 13px;
    box-shadow: 0 10px 24px rgba(0, 0, 0, 0.2);
    z-index: 40;
  }

  .cta-row {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    margin: 12px 0 18px;
  }

  .cta-row.split {
    width: 100%;
    flex-wrap: nowrap;
  }

  .cta-row.split > button {
    flex: 1 1 0;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 12px;
  }

  .inline {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .preview {
    width: 100%;
    max-width: 320px;
    border-radius: 12px;
    border: 1px solid var(--border);
    margin-bottom: 14px;
  }

  .entries {
    display: grid;
    gap: 12px;
  }

  .entry-card {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
  }

  .entry-card img {
    width: 100%;
    border-radius: 10px;
    object-fit: cover;
  }

  .entry-date {
    font-size: 12px;
    color: var(--muted);
    margin-bottom: 6px;
  }

  .entry-fields {
    display: grid;
    gap: 4px;
  }

  .entry-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .exports {
    display: grid;
    gap: 10px;
    margin-top: 12px;
  }

  .export-card {
    padding: 12px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    transition: transform 0.2s ease, box-shadow 0.2s ease;
  }

  .export-card.clickable {
    cursor: pointer;
  }

  .export-card.clickable:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 24px rgba(23, 21, 18, 0.12);
  }

  .export-name {
    font-weight: 700;
  }

  .export-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
    text-align: left;
  }

  .export-meta {
    color: var(--muted);
    font-size: 12px;
  }

  .export-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-preview {
    max-width: 200px;
    max-height: 80px;
    object-fit: contain;
    display: block;
    margin: 8px 0 12px;
    border: 1px solid var(--border);
    border-radius: 10px;
    padding: 6px;
    background: #fff;
  }

  .logo-actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
    margin-bottom: 6px;
  }

  .file-button {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #fff;
    border: 1px dashed var(--border);
    padding: 8px 12px;
    border-radius: 999px;
    font-weight: 600;
    cursor: pointer;
  }

  .file-button input {
    display: none;
  }

  .danger {
    border-color: #ef4444;
    color: #b91c1c;
    background: #fff5f5;
  }

  .muted {
    color: var(--muted);
  }

  .error {
    color: #b91c1c;
    font-weight: 600;
    margin-top: 8px;
  }

  .field-error {
    border-color: #ef4444;
    box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.15);
  }

  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(15, 23, 42, 0.45);
    backdrop-filter: blur(4px);
    z-index: 50;
  }

  .modal {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: min(520px, 92vw);
    background: #fff;
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    z-index: 60;
    box-shadow: 0 24px 60px rgba(15, 23, 42, 0.25);
  }

  .modal h3 {
    margin: 0 0 8px;
  }

  @media (max-width: 720px) {
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }
    .add-row {
      grid-template-columns: 1fr;
    }
    .entry-card {
      grid-template-columns: 1fr;
    }
  }
</style>

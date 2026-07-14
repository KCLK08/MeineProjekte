import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppLogo } from '@/components/AppLogo';
import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';
import { ensureBuiltinTemplate } from '@/lib/bootstrap';
import { createRun, deleteRunCascade, getSetupModel, listRuns, updateRun } from '@/lib/db';
import {
  applyRunDefaultsFromModel,
  buildRunTitleByConvention,
  formatWeekLabel,
  formatWeekNumber,
  getWeekKey,
  normalizeRunNameInput,
} from '@/lib/run-utils';
import type { Run } from '@/types';

export default function HomeScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [runs, setRuns] = useState<Run[]>([]);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [newRunName, setNewRunName] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [expandedWeeks, setExpandedWeeks] = useState<Record<string, boolean>>({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const id = await ensureBuiltinTemplate();
      setTemplateId(id);
      setRuns(await listRuns());
    } catch (e) {
      setError((e as Error).message || 'Daten konnten nicht geladen werden.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const weekGroups = useMemo(() => {
    const groups = new Map<string, Run[]>();
    for (const run of runs) {
      const key = getWeekKey(run.createdAt);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(run);
    }

    return [...groups.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([weekKey, weekRuns]) => ({
        weekKey,
        weekRuns: [...weekRuns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
      }));
  }, [runs]);

  function isWeekExpanded(weekKey: string) {
    if (expandedWeeks[weekKey] !== undefined) return expandedWeeks[weekKey];
    return weekGroups[0]?.weekKey === weekKey;
  }

  function toggleWeek(weekKey: string) {
    setExpandedWeeks((current) => ({
      ...current,
      [weekKey]: !isWeekExpanded(weekKey),
    }));
  }

  async function startNewRun() {
    if (!templateId) return;
    const normalized = normalizeRunNameInput(newRunName);
    if (!normalized) {
      setError('Bitte zuerst den Namen für das BTB eingeben.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const setupModel = await getSetupModel(templateId);
      if (!setupModel) throw new Error('Vorlage konnte nicht geladen werden.');

      const run = await createRun({
        templateId,
        title: buildRunTitleByConvention(normalized),
        setupVersion: setupModel.version,
      });

      const defaults = applyRunDefaultsFromModel(setupModel, run.values);
      if (defaults.changed) {
        await updateRun(run.runId, { values: defaults.values as Record<string, string | boolean> });
      }

      setNewRunName('');
      router.push(`/run/${run.runId}`);
    } catch (e) {
      setError((e as Error).message || 'BTB konnte nicht erstellt werden.');
    } finally {
      setBusy(false);
    }
  }

  function confirmDelete(run: Run) {
    Alert.alert('BTB löschen', `"${run.title}" wirklich löschen?`, [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await deleteRunCascade(run.runId);
          setInfo('BTB gelöscht.');
          await loadData();
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.muted}>Bautagebuch wird vorbereitet…</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        <View style={styles.heroBrand}>
          <AppLogo size={72} />
          <View style={styles.heroText}>
            <Text style={styles.heroEyebrow}>BÜW Bautagebuch</Text>
            <Text style={styles.heroTitle}>Ihre Baustellenprotokolle</Text>
          </View>
        </View>
        <Text style={styles.heroSubtitle}>Offline erfassen, live als PDF prüfen und direkt exportieren.</Text>
      </View>

      {error ? <View style={styles.bannerError}><Text style={styles.bannerErrorText}>{error}</Text></View> : null}
      {info ? <View style={styles.bannerInfo}><Text style={styles.bannerInfoText}>{info}</Text></View> : null}

      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Ionicons name="add-circle-outline" size={22} color={colors.primary} />
          <Text style={styles.cardTitle}>Neues Bautagebuch</Text>
        </View>
        <Text style={styles.cardHint}>Geben Sie Projekt oder Baustelle ein und starten Sie das BTB.</Text>
        <TextInput
          style={styles.input}
          placeholder="z. B. Neubau Musterstraße"
          placeholderTextColor={colors.textMuted}
          value={newRunName}
          onChangeText={setNewRunName}
        />
        <Pressable style={[styles.primaryButton, busy && styles.disabled]} onPress={startNewRun} disabled={busy}>
          <Text style={styles.primaryButtonText}>{busy ? 'Wird erstellt…' : 'BTB starten'}</Text>
        </Pressable>
      </View>

      {weekGroups.map(({ weekKey, weekRuns }) => {
        const expanded = isWeekExpanded(weekKey);
        return (
          <View key={weekKey} style={styles.weekCard}>
            <Pressable style={styles.weekHeader} onPress={() => toggleWeek(weekKey)}>
              <View style={styles.weekHeaderText}>
                <Text style={styles.weekTitle}>Kalenderwoche {formatWeekNumber(weekKey)}</Text>
                <Text style={styles.weekLabel}>{formatWeekLabel(weekKey)}</Text>
              </View>
              <View style={styles.weekMeta}>
                <View style={styles.countPill}>
                  <Text style={styles.countPillText}>{weekRuns.length}</Text>
                </View>
                <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={20} color={colors.textMuted} />
              </View>
            </Pressable>

            {expanded ? (
              <View style={styles.weekBody}>
                {weekRuns.map((run) => (
                  <Pressable key={run.runId} style={styles.runCard} onPress={() => router.push(`/run/${run.runId}`)}>
                    <View style={styles.runHeader}>
                      <View style={styles.runTitleWrap}>
                        <Text style={styles.runTitle}>{run.title}</Text>
                        <Text style={styles.runMeta}>Erstellt: {new Date(run.createdAt).toLocaleString('de-DE')}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </View>
                    <View style={styles.runFooter}>
                      <View style={[styles.statusPill, run.status === 'completed' ? styles.statusDone : styles.statusOpen]}>
                        <Text style={styles.statusPillText}>{run.status === 'completed' ? 'Abgeschlossen' : 'In Bearbeitung'}</Text>
                      </View>
                      <Pressable onPress={() => confirmDelete(run)} hitSlop={8}>
                        <Text style={styles.delete}>Löschen</Text>
                      </Pressable>
                    </View>
                  </Pressable>
                ))}
              </View>
            ) : null}
          </View>
        );
      })}

      {runs.length === 0 ? (
        <View style={styles.emptyState}>
          <Ionicons name="document-outline" size={34} color={colors.textMuted} />
          <Text style={styles.emptyTitle}>Noch keine Bautagebücher</Text>
          <Text style={styles.emptyText}>Starten Sie oben Ihr erstes BTB – die Vorlage eBTB ist bereits hinterlegt.</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: ui.spacing.md, paddingBottom: 40 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.background },
  hero: {
    backgroundColor: colors.primary,
    borderRadius: ui.radius.lg,
    marginBottom: ui.spacing.md,
    padding: ui.spacing.lg,
    ...ui.shadow.card,
  },
  heroBrand: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  heroText: {
    flex: 1,
  },
  heroEyebrow: { color: '#d7ebe7', fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heroTitle: { color: '#fff', fontSize: 24, fontWeight: '800', marginTop: 6 },
  heroSubtitle: { color: '#e7f3f0', fontSize: 15, lineHeight: 22, marginTop: 12 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: ui.radius.md,
    marginBottom: ui.spacing.lg,
    padding: ui.spacing.md,
    ...ui.shadow.card,
  },
  cardHeader: { alignItems: 'center', flexDirection: 'row', gap: 8, marginBottom: 6 },
  cardTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  cardHint: { color: colors.textMuted, fontSize: 14, lineHeight: 20, marginBottom: 12 },
  input: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: ui.radius.sm,
    borderWidth: 1,
    color: colors.text,
    fontSize: 16,
    marginBottom: 12,
    minHeight: 50,
    paddingHorizontal: 14,
  },
  primaryButton: { backgroundColor: colors.primary, borderRadius: ui.radius.sm, paddingVertical: 15 },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  disabled: { opacity: 0.6 },
  weekCard: {
    backgroundColor: colors.surface,
    borderRadius: ui.radius.md,
    marginBottom: ui.spacing.md,
    overflow: 'hidden',
    ...ui.shadow.card,
  },
  weekHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: ui.spacing.md,
  },
  weekHeaderText: {
    flex: 1,
    paddingRight: 12,
  },
  weekTitle: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '800',
  },
  weekLabel: {
    color: colors.textMuted,
    fontSize: 13,
    marginTop: 4,
  },
  weekMeta: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  countPill: {
    backgroundColor: colors.primarySoft,
    borderRadius: ui.radius.pill,
    minWidth: 28,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countPillText: {
    color: colors.primary,
    fontSize: 12,
    fontWeight: '800',
    textAlign: 'center',
  },
  weekBody: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    gap: 10,
    padding: ui.spacing.md,
    paddingTop: 0,
  },
  runCard: {
    backgroundColor: colors.card,
    borderColor: colors.border,
    borderRadius: ui.radius.sm,
    borderWidth: 1,
    marginTop: 10,
    padding: ui.spacing.md,
  },
  runHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  runTitleWrap: { flex: 1, paddingRight: 8 },
  runTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  runMeta: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
  runFooter: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },
  statusPill: { borderRadius: ui.radius.pill, paddingHorizontal: 10, paddingVertical: 5 },
  statusDone: { backgroundColor: '#e8f7ee' },
  statusOpen: { backgroundColor: '#eef2ff' },
  statusPillText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  delete: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  bannerError: { backgroundColor: '#fdecec', borderRadius: ui.radius.sm, marginBottom: 12, padding: 12 },
  bannerErrorText: { color: colors.danger, fontWeight: '600' },
  bannerInfo: { backgroundColor: colors.primarySoft, borderRadius: ui.radius.sm, marginBottom: 12, padding: 12 },
  bannerInfoText: { color: colors.primary, fontWeight: '600' },
  emptyState: { alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 24 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', marginTop: 8 },
  emptyText: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
});

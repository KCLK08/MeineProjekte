import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import { colors } from '@/theme/colors';
import { getSetupModel, getTemplate } from '@/lib/db';
import { validateSetupModel } from '@/lib/setup-model';
import type { SetupModel, Template } from '@/types';

export default function SetupScreen() {
  const { templateId } = useLocalSearchParams<{ templateId: string }>();
  const [loading, setLoading] = useState(true);
  const [template, setTemplate] = useState<Template | null>(null);
  const [model, setModel] = useState<SetupModel | null>(null);

  const load = useCallback(async () => {
    if (!templateId) return;
    setLoading(true);
    const tpl = await getTemplate(templateId);
    const setup = await getSetupModel(templateId);
    setTemplate(tpl);
    setModel(setup);
    setLoading(false);
  }, [templateId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  if (!template || !model) {
    return (
      <View style={styles.centered}>
        <Text>Setup nicht gefunden.</Text>
      </View>
    );
  }

  const issues = validateSetupModel(model);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>{template.templateName}</Text>
      <Text style={styles.meta}>
        Status: {template.status} · Version {model.version} · {model.single_sections.length} Gruppen · {model.table_sections.length} Tabellen
      </Text>

      {issues.length > 0 ? (
        <View style={styles.warningBox}>
          <Text style={styles.warningTitle}>Hinweise</Text>
          {issues.map((issue) => (
            <Text key={issue} style={styles.warningText}>
              • {issue}
            </Text>
          ))}
        </View>
      ) : (
        <View style={styles.okBox}>
          <Text style={styles.okText}>Setup ist gültig und einsatzbereit.</Text>
        </View>
      )}

      {(model.single_sections || []).map((section) => (
        <View key={section.sectionId} style={styles.card}>
          <Text style={styles.cardTitle}>{section.label}</Text>
          <Text style={styles.cardMeta}>{(section.fields || []).filter((f) => !f.skipped).length} Felder</Text>
        </View>
      ))}

      {(model.table_sections || []).map((table) => (
        <View key={table.tableId} style={styles.card}>
          <Text style={styles.cardTitle}>{table.label}</Text>
          <Text style={styles.cardMeta}>
            {(table.columns || []).filter((c) => !c.skipped).length} Spalten · {(table.rows || []).length} Zeilen
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, gap: 12 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  title: { color: colors.text, fontSize: 22, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 14, marginBottom: 8 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: 12, borderWidth: 1, padding: 14 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  cardMeta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  warningBox: { backgroundColor: '#fff7ed', borderRadius: 10, padding: 12 },
  warningTitle: { color: colors.warning, fontWeight: '700', marginBottom: 6 },
  warningText: { color: colors.text, fontSize: 13, marginBottom: 4 },
  okBox: { backgroundColor: '#e8f4f2', borderRadius: 10, padding: 12 },
  okText: { color: colors.primary, fontWeight: '600' },
});

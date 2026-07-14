import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { PdfPreviewPane } from '@/components/PdfPreviewPane';
import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';
import { ensureBuiltinTemplate } from '@/lib/bootstrap';
import {
  createTemplate,
  getSetupModel,
  getTemplateBytes,
  listTemplates,
  markTemplateReady,
  saveDetectedFields,
  saveSetupModel,
} from '@/lib/db';
import { cachePdfBytes } from '@/lib/pdf-preview';
import type { SetupModel } from '@/types';
import { buildEtbSetupModel } from '@/lib/etb-setup';
import { ETB_TEMPLATE_KIND } from '@/lib/etb-template';
import { scanTemplatePdf } from '@/lib/setup-model';
import type { Template } from '@/types';

const MAX_PDF_SIZE = 40 * 1024 * 1024;

export default function TemplatesScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [error, setError] = useState('');
  const [previewTemplateId, setPreviewTemplateId] = useState<string | null>(null);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await ensureBuiltinTemplate();
      setTemplates(await listTemplates());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  async function showTemplatePreview(template: Template) {
    setPreviewTemplateId(template.templateId);
    setPreviewLoading(true);
    setPreviewError('');
    try {
      const bytes = await getTemplateBytes(template.templateId);
      if (!bytes) throw new Error('Vorlage konnte nicht geladen werden.');
      const uri = await cachePdfBytes(bytes, `${template.fileName || 'vorlage'}.pdf`);
      setPreviewUri(uri);
    } catch (e) {
      setPreviewUri(null);
      setPreviewError((e as Error).message);
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    if (previewTemplateId || templates.length === 0) return;
    const builtin = templates.find((template) => template.templateKind === ETB_TEMPLATE_KIND) || templates[0];
    if (builtin) {
      setPreviewTemplateId(builtin.templateId);
      showTemplatePreview(builtin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates]);

  async function uploadTemplate() {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;

    const asset = result.assets[0];
    setBusy(true);
    setError('');

    try {
      const response = await fetch(asset.uri);
      const buffer = await response.arrayBuffer();
      const pdfBytes = new Uint8Array(buffer);
      if (pdfBytes.byteLength > MAX_PDF_SIZE) {
        throw new Error('PDF überschreitet 40 MB.');
      }

      const scanResult = await scanTemplatePdf(pdfBytes);
      const template = await createTemplate({
        templateName: asset.name?.replace(/\.pdf$/i, '') || 'Neue Vorlage',
        fileName: asset.name || 'vorlage.pdf',
        mimeType: 'application/pdf',
        sizeBytes: pdfBytes.byteLength,
        pdfBytes,
        pageCount: scanResult.pageCount,
      });

      await saveDetectedFields(template.templateId, scanResult.detectedFields);
      const setupModel = buildEtbSetupModel({
        templateId: template.templateId,
        pageCount: scanResult.pageCount,
        detectedFields: scanResult.detectedFields,
      }) as SetupModel;
      await saveSetupModel(template.templateId, setupModel, { status: 'ready' });
      await markTemplateReady(template.templateId);
      await loadData();
      await showTemplatePreview(template);
    } catch (e) {
      setError((e as Error).message || 'Upload fehlgeschlagen.');
    } finally {
      setBusy(false);
    }
  }

  async function refreshBuiltin() {
    setBusy(true);
    try {
      await ensureBuiltinTemplate(true);
      await loadData();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {error ? <View style={styles.errorBox}><Text style={styles.error}>{error}</Text></View> : null}

      <View style={styles.actions}>
        <Pressable style={styles.primaryButton} onPress={uploadTemplate} disabled={busy}>
          <Ionicons name="cloud-upload-outline" size={18} color="#fff" />
          <Text style={styles.primaryButtonText}>PDF-Vorlage hochladen</Text>
        </Pressable>

        <Pressable style={styles.secondaryButton} onPress={refreshBuiltin} disabled={busy}>
          <Text style={styles.secondaryButtonText}>Vorlage-eBTB neu einlesen</Text>
        </Pressable>
      </View>

      <View style={styles.previewCard}>
        <PdfPreviewPane
          compact
          fileUri={previewUri}
          loading={previewLoading}
          error={previewError}
          title="Vorlagen-Vorschau"
          onRefresh={() => {
            const template = templates.find((item) => item.templateId === previewTemplateId) || templates[0];
            if (template) showTemplatePreview(template);
          }}
        />
      </View>

      {templates.map((template) => (
        <View key={template.templateId} style={styles.card}>
          <Pressable onPress={() => router.push(`/setup/${template.templateId}`)}>
            <Text style={styles.title}>{template.templateName}</Text>
            <Text style={styles.meta}>
              {template.fileName} · {template.pageCount} Seite(n) · {template.status === 'ready' ? 'Bereit' : 'Entwurf'}
            </Text>
            {template.templateKind === ETB_TEMPLATE_KIND ? <Text style={styles.badge}>Standard eBTB</Text> : null}
          </Pressable>
          <Pressable style={styles.previewButton} onPress={() => showTemplatePreview(template)}>
            <Ionicons name="eye-outline" size={16} color={colors.primary} />
            <Text style={styles.previewButtonText}>PDF anzeigen</Text>
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  content: { gap: 12, padding: ui.spacing.md },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background },
  actions: { gap: 10 },
  primaryButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: ui.radius.sm,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryButtonText: { color: '#fff', fontWeight: '800' },
  secondaryButton: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: ui.radius.sm,
    borderWidth: 1,
    paddingVertical: 12,
  },
  secondaryButtonText: { color: colors.primary, fontWeight: '700', textAlign: 'center' },
  previewCard: { height: 300 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: ui.radius.md,
    padding: ui.spacing.md,
    ...ui.shadow.card,
  },
  title: { color: colors.text, fontSize: 16, fontWeight: '800' },
  meta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  badge: { color: colors.primary, fontSize: 12, fontWeight: '700', marginTop: 8 },
  previewButton: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
  },
  previewButtonText: { color: colors.primary, fontWeight: '700' },
  errorBox: { backgroundColor: '#fdecec', borderRadius: ui.radius.sm, padding: 12 },
  error: { color: colors.danger, fontWeight: '600' },
});

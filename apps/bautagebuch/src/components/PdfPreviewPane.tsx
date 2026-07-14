import { useMemo } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { PdfHtmlFrame } from './PdfHtmlFrame';
import { bytesToBase64, pdfPreviewStyles as styles } from './pdf-preview-shared';

interface PdfPreviewPaneProps {
  fileUri: string | null;
  loading?: boolean;
  error?: string;
  title?: string;
  onRefresh?: () => void;
  compact?: boolean;
}

export function PdfPreviewPane({
  fileUri,
  loading = false,
  error = '',
  title = 'PDF-Vorschau',
  onRefresh,
  compact = false,
}: PdfPreviewPaneProps) {
  const ready = useMemo(() => Boolean(fileUri), [fileUri]);

  if (loading) {
    return (
      <View style={[styles.container, compact && styles.compact]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>PDF-Vorschau wird erstellt…</Text>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={[styles.container, compact && styles.compact]}>
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>Vorschau nicht verfügbar</Text>
          <Text style={styles.errorText}>{error}</Text>
          {onRefresh ? (
            <Pressable style={styles.refreshButton} onPress={onRefresh}>
              <Text style={styles.refreshButtonText}>Erneut versuchen</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    );
  }

  if (!ready || !fileUri) {
    return (
      <View style={[styles.container, compact && styles.compact]}>
        <View style={styles.centered}>
          <Text style={styles.placeholderTitle}>{title}</Text>
          <Text style={styles.placeholderText}>Die Vorschau wird automatisch aus Ihren Eingaben erzeugt.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, compact && styles.compact]}>
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>{title}</Text>
          <Text style={styles.headerHint}>Live-Ansicht des ausgefüllten BTB</Text>
        </View>
        {onRefresh ? (
          <Pressable style={styles.refreshChip} onPress={onRefresh}>
            <Text style={styles.refreshChipText}>Aktualisieren</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={styles.viewer}>
        <PdfHtmlFrame fileUri={fileUri} />
      </View>
    </View>
  );
}

export async function previewBytesToDataUri(bytes: Uint8Array): Promise<string> {
  return `data:application/pdf;base64,${bytesToBase64(bytes)}`;
}

import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilePreview } from '@/components/FilePreview';
import { EmptyState, LoadingBlock, PrimaryButton, Screen } from '@/components/ui';
import * as repo from '@/db/repository';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyDocument } from '@/types/models';
import { exportUriAsPdf } from '@/utils/files';

export default function DocumentPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const people = useFamilyStore((s) => s.people);
  const documentTypes = useFamilyStore((s) => s.documentTypes);
  const removeDocument = useFamilyStore((s) => s.removeDocument);
  const [doc, setDoc] = useState<FamilyDocument | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => setDoc(await repo.getDocument(id)))();
  }, [id]);

  const person = useMemo(() => people.find((p) => p.id === doc?.personId), [people, doc]);
  const type = useMemo(() => documentTypes.find((t) => t.id === doc?.documentTypeId), [documentTypes, doc]);
  const title = type?.name || 'Dokument';

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerShown: true,
    });
  }, [navigation, title]);

  if (!doc) {
    return (
      <Screen>
        <LoadingBlock label="Dokument wird geladen…" />
      </Screen>
    );
  }

  const hasFile = Boolean(doc.filePath?.trim());
  const subtitle = person ? `${person.vorname} ${person.nachname}` : 'Unbekannte Person';

  async function onExportPdf() {
    if (!doc?.filePath) {
      Alert.alert('Kein Anhang', 'Diesem Dokument ist noch keine Datei hinterlegt.');
      return;
    }
    try {
      setExporting(true);
      const name = `${type?.name || 'Dokument'}_${person?.nachname || 'export'}`;
      await exportUriAsPdf(doc.filePath, name);
    } catch (e) {
      Alert.alert('PDF-Export fehlgeschlagen', (e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Screen>
      <View className="border-b border-line bg-paper px-4 py-3">
        <Text className="font-sansBold text-base text-ink" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 font-sans text-sm text-mute" numberOfLines={1}>
          {subtitle}
          {doc.documentNumber ? ` · Nr. ${doc.documentNumber}` : ''}
        </Text>
      </View>

      <View className="flex-1">
        {hasFile ? (
          <FilePreview uri={doc.filePath} />
        ) : (
          <EmptyState
            icon="document-outline"
            title="Keine Datei hinterlegt"
            subtitle="Bearbeite das Dokument, um ein Foto oder PDF anzuhängen."
          />
        )}
      </View>

      <View
        className="gap-2 border-t border-line bg-paper px-4 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) + 4 }}
      >
        {hasFile ? (
          <PrimaryButton
            label={exporting ? 'Speichert…' : 'Als PDF speichern'}
            icon="download-outline"
            onPress={onExportPdf}
            disabled={exporting}
          />
        ) : null}
        <View className="flex-row gap-2">
          <View className="flex-1">
            <PrimaryButton
              label="Bearbeiten"
              tone="soft"
              icon="create-outline"
              onPress={() => router.push(`/document/edit/${doc.id}`)}
            />
          </View>
          <View className="flex-1">
            <PrimaryButton
              label="Löschen"
              tone="ghost"
              icon="trash-outline"
              onPress={() =>
                Alert.alert('Dokument löschen?', undefined, [
                  { text: 'Abbrechen', style: 'cancel' },
                  {
                    text: 'Löschen',
                    style: 'destructive',
                    onPress: async () => {
                      await removeDocument(doc.id);
                      router.back();
                    },
                  },
                ])
              }
            />
          </View>
        </View>
      </View>
    </Screen>
  );
}

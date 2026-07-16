import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilePreview } from '@/components/FilePreview';
import { EmptyState, LoadingBlock, PrimaryButton, Screen } from '@/components/ui';
import * as repo from '@/db/repository';
import { requireSecureAccess } from '@/security/access';
import { DocumentEncryptionService } from '@/security/DocumentEncryptionService';
import { ExportHistory } from '@/security/ExportHistory';
import { subscribePreviewWipe } from '@/security/previewSession';
import { SecurityEventLog } from '@/security/SecurityEventLog';
import { SecurityManager } from '@/security/SecurityManager';
import { useFamilyStore } from '@/store/familyStore';
import { useSecurityStore } from '@/store/securityStore';
import type { FamilyDocument } from '@/types/models';
import { exportUriAsPdf, guessFileKind } from '@/utils/files';

export default function DocumentPreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const people = useFamilyStore((s) => s.people);
  const removeDocument = useFamilyStore((s) => s.removeDocument);
  const wipeToken = useSecurityStore((s) => s.wipeToken);
  const isLocked = useSecurityStore((s) => s.isLocked);
  const [doc, setDoc] = useState<FamilyDocument | null>(null);
  const [readableUri, setReadableUri] = useState<string | null>(null);
  const [previewUnlocked, setPreviewUnlocked] = useState(false);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    return subscribePreviewWipe(() => {
      setReadableUri(null);
      setDoc(null);
      setPreviewUnlocked(false);
    });
  }, []);

  useEffect(() => {
    if (isLocked) {
      setReadableUri(null);
      setDoc(null);
      setPreviewUnlocked(false);
    }
  }, [isLocked, wipeToken]);

  useEffect(() => {
    if (!id || isLocked) return;
    let cancelled = false;
    (async () => {
      const row = await repo.getDocument(id);
      if (!cancelled) {
        setDoc(row);
        setReadableUri(null);
        setPreviewUnlocked(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, isLocked, wipeToken]);

  const assignedPeople = useMemo(
    () => people.filter((p) => doc?.personIds.includes(p.id)),
    [people, doc]
  );
  const title = doc?.name || 'Dokument';
  const subtitle =
    assignedPeople.map((p) => `${p.vorname} ${p.nachname}`).join(', ') || 'Keine Person zugeordnet';

  useLayoutEffect(() => {
    navigation.setOptions({
      title,
      headerShown: true,
    });
  }, [navigation, title]);

  async function unlockPreview() {
    if (!doc?.filePath?.trim()) return;
    setPreviewBusy(true);
    try {
      const access = await requireSecureAccess('Dokumentvorschau freigeben', { force: true });
      if (!access.ok) {
        Alert.alert('Geschützt', access.reason);
        return;
      }
      const kind = guessFileKind(doc.filePath);
      const ext =
        DocumentEncryptionService.extensionFromEncryptedPath(doc.filePath) ||
        (kind === 'pdf' ? '.pdf' : kind === 'image' ? '.jpg' : '.bin');
      const uri = await SecurityManager.resolveReadableUri(doc.filePath, ext);
      setReadableUri(uri);
      setPreviewUnlocked(true);
    } catch (e) {
      setReadableUri(null);
      setPreviewUnlocked(false);
      Alert.alert('Vorschau', (e as Error).message);
    } finally {
      setPreviewBusy(false);
    }
  }

  if (!doc) {
    return (
      <Screen>
        <LoadingBlock label="Dokument wird geladen…" />
      </Screen>
    );
  }

  const hasFile = Boolean(doc.filePath?.trim());

  function onExportPdf() {
    if (!doc?.filePath) {
      Alert.alert('Kein Anhang', 'Diesem Dokument ist keine Datei hinterlegt.');
      return;
    }
    Alert.alert(
      'Dokument exportieren',
      'Der Export erstellt eine entschlüsselte Datei außerhalb des geschützten Family Vault Tresors.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: 'Exportieren',
          onPress: () => {
            void (async () => {
              try {
                setExporting(true);
                if (!previewUnlocked) {
                  const access = await requireSecureAccess('Export freigeben', { force: true });
                  if (!access.ok) {
                    Alert.alert('Geschützt', access.reason);
                    return;
                  }
                }
                const name = `${doc.name || 'Dokument'}_${assignedPeople[0]?.nachname || 'export'}`;
                const source =
                  readableUri ||
                  (await SecurityManager.resolveReadableUri(
                    doc.filePath,
                    DocumentEncryptionService.extensionFromEncryptedPath(doc.filePath) || '.pdf'
                  ));
                await exportUriAsPdf(source, name);
                await ExportHistory.record(doc.id, 'pdf');
                await SecurityEventLog.record('export_performed');
                Alert.alert(
                  'Export abgeschlossen',
                  'Die exportierte Datei liegt außerhalb von Family Vault und sollte nach Verwendung gelöscht werden.'
                );
              } catch (e) {
                Alert.alert('PDF-Export fehlgeschlagen', (e as Error).message);
              } finally {
                setExporting(false);
              }
            })();
          },
        },
      ]
    );
  }

  return (
    <Screen safeBottom={false}>
      <View className="border-b border-line bg-paper px-4 py-3 dark:border-[#2a3f35]">
        <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]" numberOfLines={1}>
          {title}
        </Text>
        <Text className="mt-0.5 font-sans text-sm text-mute dark:text-[#9bb0a6]" numberOfLines={2}>
          {subtitle}
        </Text>
      </View>

      <View className="flex-1">
        {hasFile && previewUnlocked && readableUri && !isLocked ? (
          <FilePreview uri={readableUri} wipeToken={wipeToken} />
        ) : hasFile ? (
          <View className="flex-1 items-center justify-center px-8">
            <EmptyState icon="lock-closed-outline" title="Vorschau geschützt" />
            <PrimaryButton
              label={previewBusy ? 'Prüft…' : 'Vorschau freigeben'}
              icon="finger-print-outline"
              onPress={() => void unlockPreview()}
              disabled={previewBusy || isLocked}
            />
          </View>
        ) : (
          <EmptyState icon="document-outline" title="Keine Datei hinterlegt" />
        )}
      </View>

      <View
        className="gap-2 border-t border-line bg-paper px-4 pt-3 dark:border-[#2a3f35]"
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
                      if (doc.filePath) {
                        await DocumentEncryptionService.deleteEncryptedFile(doc.filePath);
                      }
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

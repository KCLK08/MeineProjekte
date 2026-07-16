import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import {
  InfoRow,
  LoadingBlock,
  Panel,
  PrimaryButton,
  Screen,
  SectionTitle,
  StatusBadge,
} from '@/components/ui';
import * as repo from '@/db/repository';
import { useFamilyStore } from '@/store/familyStore';
import type { FamilyDocument } from '@/types/models';
import { formatDateDe, isExpired, isExpiringSoon } from '@/utils/helpers';

export default function DocumentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const people = useFamilyStore((s) => s.people);
  const documentTypes = useFamilyStore((s) => s.documentTypes);
  const removeDocument = useFamilyStore((s) => s.removeDocument);
  const [doc, setDoc] = useState<FamilyDocument | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => setDoc(await repo.getDocument(id)))();
  }, [id]);

  const person = useMemo(() => people.find((p) => p.id === doc?.personId), [people, doc]);
  const type = useMemo(() => documentTypes.find((t) => t.id === doc?.documentTypeId), [documentTypes, doc]);

  if (!doc) {
    return (
      <Screen>
        <LoadingBlock label="Dokument wird geladen…" />
      </Screen>
    );
  }

  const expired = Boolean(type?.expiryDateRelevant && isExpired(doc.expiryDate));
  const soon = Boolean(type?.expiryDateRelevant && isExpiringSoon(doc.expiryDate));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }}>
        <Animated.View entering={FadeInDown.springify().damping(16)}>
          <Text className="font-display text-3xl text-ink" style={{ letterSpacing: -0.5 }}>
            {type?.name || 'Dokument'}
          </Text>
          <Text className="mt-1.5 font-sans text-[15px] text-mute">
            {person ? `${person.vorname} ${person.nachname}` : 'Unbekannte Person'}
          </Text>
          <View className="mt-3 flex-row flex-wrap gap-2">
            {type?.expiryDateRelevant && doc.expiryDate ? (
              <StatusBadge
                label={
                  expired
                    ? `Abgelaufen · ${formatDateDe(doc.expiryDate)}`
                    : soon
                      ? `Bald fällig · ${formatDateDe(doc.expiryDate)}`
                      : `Gültig bis ${formatDateDe(doc.expiryDate)}`
                }
                tone={expired ? 'danger' : soon ? 'warn' : 'ok'}
              />
            ) : (
              <StatusBadge label="Kein Ablaufdatum" />
            )}
            <StatusBadge label={doc.filePath ? 'Anhang lokal' : 'Ohne Datei'} tone={doc.filePath ? 'ok' : 'neutral'} />
          </View>
        </Animated.View>

        <View className="mt-5">
          <PrimaryButton
            label="Dokument bearbeiten"
            icon="create-outline"
            onPress={() => router.push(`/document/edit/${doc.id}`)}
          />
        </View>

        <View className="mt-6">
          <SectionTitle>Details</SectionTitle>
          <Panel>
            <InfoRow label="Nummer" value={doc.documentNumber} />
            {type?.expiryDateRelevant ? <InfoRow label="Ablaufdatum" value={formatDateDe(doc.expiryDate)} /> : null}
            <InfoRow label="Notiz" value={doc.notes} />
            <InfoRow label="Datei" value={doc.filePath ? 'Lokal hinterlegt' : 'Kein Anhang'} />
          </Panel>
        </View>

        <View className="mt-8">
          <PrimaryButton
            label="Dokument löschen"
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
      </ScrollView>
    </Screen>
  );
}

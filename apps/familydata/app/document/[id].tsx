import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Card, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
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
      <Screen className="items-center justify-center">
        <Text className="text-mist">Dokument wird geladen…</Text>
      </Screen>
    );
  }

  const expired = Boolean(type?.expiryDateRelevant && isExpired(doc.expiryDate));
  const soon = Boolean(type?.expiryDateRelevant && isExpiringSoon(doc.expiryDate));

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="text-2xl font-extrabold text-ink">{type?.name || 'Dokument'}</Text>
        <Text className="mt-1 text-mist">
          {person ? `${person.vorname} ${person.nachname}` : 'Unbekannte Person'}
        </Text>

        <View className="mt-4 flex-row gap-2">
          <View className="flex-1">
            <PrimaryButton label="Bearbeiten" onPress={() => router.push(`/document/edit/${doc.id}`)} />
          </View>
          <View className="flex-1">
            <PrimaryButton
              label="Löschen"
              tone="danger"
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

        <View className="mt-6">
          <SectionTitle>Details</SectionTitle>
          <Card>
            <Info label="Nummer" value={doc.documentNumber} />
            {type?.expiryDateRelevant ? (
              <Info
                label="Ablaufdatum"
                value={`${formatDateDe(doc.expiryDate)}${expired ? ' (abgelaufen)' : soon ? ' (bald)' : ''}`}
              />
            ) : null}
            <Info label="Notiz" value={doc.notes} />
            <Info label="Datei" value={doc.filePath ? 'Lokal hinterlegt' : 'Kein Anhang'} />
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="mb-3">
      <Text className="text-xs font-bold uppercase text-mist">{label}</Text>
      <Text className="mt-0.5 text-base text-ink">{value}</Text>
    </View>
  );
}

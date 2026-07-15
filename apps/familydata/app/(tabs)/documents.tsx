import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Chip, EmptyState, PrimaryButton, Screen } from '@/components/ui';
import { useFamilyStore } from '@/store/familyStore';
import { formatDateDe, isExpired, isExpiringSoon } from '@/utils/helpers';

export default function DocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const people = useFamilyStore((s) => s.people);
  const documentTypes = useFamilyStore((s) => s.documentTypes);
  const documents = useFamilyStore((s) => s.documents);
  const refreshDocuments = useFamilyStore((s) => s.refreshDocuments);

  const [personId, setPersonId] = useState('');
  const [typeId, setTypeId] = useState('');

  useFocusEffect(
    useCallback(() => {
      refreshDocuments({
        personId: personId || undefined,
        documentTypeId: typeId || undefined,
      });
    }, [personId, typeId, refreshDocuments])
  );

  const filtersActive = useMemo(() => Boolean(personId || typeId), [personId, typeId]);

  return (
    <Screen>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="text-2xl font-extrabold text-ink">Dokumente</Text>
            <Text className="mt-1 text-base text-mist">Immer einer Person zugeordnet. Keine echten Dateien im Repo.</Text>
            <View className="mt-4">
              <PrimaryButton label="Dokument hinzufügen" onPress={() => router.push('/document/new')} />
            </View>
            <Text className="mb-2 mt-5 text-xs font-bold uppercase tracking-wide text-mist">Familienmitglied</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
              <Chip label="Alle" active={!personId} onPress={() => setPersonId('')} />
              {people.map((p) => (
                <Chip
                  key={p.id}
                  label={`${p.vorname}`}
                  active={personId === p.id}
                  onPress={() => setPersonId(p.id)}
                />
              ))}
            </ScrollView>
            <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-mist">Dokumenttyp</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <Chip label="Alle" active={!typeId} onPress={() => setTypeId('')} />
              {documentTypes.map((t) => (
                <Chip key={t.id} label={t.name} active={typeId === t.id} onPress={() => setTypeId(t.id)} />
              ))}
            </ScrollView>
            {filtersActive ? (
              <Pressable className="mt-3" onPress={() => { setPersonId(''); setTypeId(''); }}>
                <Text className="font-semibold text-forest-700">Filter zurücksetzen</Text>
              </Pressable>
            ) : null}
          </View>
        }
        ListEmptyComponent={<EmptyState title="Keine Dokumente" subtitle="Filter anpassen oder neues Dokument anlegen." />}
        renderItem={({ item }) => {
          const expired = Boolean(item.expiryDateRelevant && isExpired(item.expiryDate));
          const soon = Boolean(item.expiryDateRelevant && isExpiringSoon(item.expiryDate));
          return (
            <Pressable onPress={() => router.push(`/document/${item.id}`)} className="mb-3">
              <Card>
                <Text className="text-lg font-bold text-ink">{item.typeName}</Text>
                <Text className="mt-1 text-sm text-mist">{item.personName}</Text>
                {item.documentNumber ? <Text className="mt-2 text-sm text-ink">Nr. {item.documentNumber}</Text> : null}
                {item.expiryDateRelevant && item.expiryDate ? (
                  <Text className={`mt-2 text-sm font-semibold ${expired ? 'text-danger' : soon ? 'text-amber-700' : 'text-mist'}`}>
                    Ablauf: {formatDateDe(item.expiryDate)}
                    {expired ? ' · abgelaufen' : soon ? ' · bald' : ''}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
          );
        }}
      />
    </Screen>
  );
}

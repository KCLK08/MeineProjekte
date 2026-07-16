import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EmptyState,
  FilterChip,
  IconButton,
  ListRow,
  PageHeader,
  Screen,
  SectionTitle,
  StatusBadge,
} from '@/components/ui';
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
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 + insets.top, paddingBottom: 28 + insets.bottom }}
        ListHeaderComponent={
          <View className="mb-2">
            <PageHeader
              title="Dokumente"
              subtitle="Immer einer Person zugeordnet · lokal auf dem Gerät"
              action={
                <IconButton icon="add" label="Dokument hinzufügen" onPress={() => router.push('/document/new')} />
              }
            />

            <SectionTitle>Person</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-4">
              <FilterChip label="Alle" active={!personId} onPress={() => setPersonId('')} />
              {people.map((p) => (
                <FilterChip
                  key={p.id}
                  label={p.vorname}
                  active={personId === p.id}
                  onPress={() => setPersonId(p.id)}
                />
              ))}
            </ScrollView>

            <SectionTitle>Typ</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
              <FilterChip label="Alle" active={!typeId} onPress={() => setTypeId('')} />
              {documentTypes.map((t) => (
                <FilterChip key={t.id} label={t.name} active={typeId === t.id} onPress={() => setTypeId(t.id)} />
              ))}
            </ScrollView>

            {filtersActive ? (
              <Pressable className="mb-3 mt-2 self-start" onPress={() => { setPersonId(''); setTypeId(''); }}>
                <Text className="font-sansBold text-sm text-pine-700">Filter zurücksetzen</Text>
              </Pressable>
            ) : (
              <View className="mb-3" />
            )}
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="document-outline"
            title="Keine Dokumente"
            subtitle="Filter anpassen oder ein neues Dokument anlegen."
          />
        }
        renderItem={({ item, index }) => {
          const expired = Boolean(item.expiryDateRelevant && isExpired(item.expiryDate));
          const soon = Boolean(item.expiryDateRelevant && isExpiringSoon(item.expiryDate));
          return (
            <ListRow
              index={index}
              title={item.typeName}
              subtitle={item.personName}
              meta={
                <View className="flex-row flex-wrap gap-2">
                  {item.documentNumber ? <StatusBadge label={`Nr. ${item.documentNumber}`} /> : null}
                  {item.expiryDateRelevant && item.expiryDate ? (
                    <StatusBadge
                      label={
                        expired
                          ? `Abgelaufen · ${formatDateDe(item.expiryDate)}`
                          : soon
                            ? `Bald · ${formatDateDe(item.expiryDate)}`
                            : `Bis ${formatDateDe(item.expiryDate)}`
                      }
                      tone={expired ? 'danger' : soon ? 'warn' : 'ok'}
                    />
                  ) : null}
                </View>
              }
              onPress={() => router.push(`/document/${item.id}`)}
            />
          );
        }}
      />
    </Screen>
  );
}

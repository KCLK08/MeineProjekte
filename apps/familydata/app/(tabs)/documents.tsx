import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
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
import { useAppTheme } from '@/theme/useAppTheme';
import { formatDateDe, isExpired, isExpiringSoon } from '@/utils/helpers';

export default function DocumentsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const people = useFamilyStore((s) => s.people);
  const documents = useFamilyStore((s) => s.documents);
  const refreshDocuments = useFamilyStore((s) => s.refreshDocuments);

  const [personId, setPersonId] = useState('');
  const [query, setQuery] = useState('');

  useFocusEffect(
    useCallback(() => {
      refreshDocuments({
        personId: personId || undefined,
        query: query.trim() || undefined,
      });
    }, [personId, query, refreshDocuments])
  );

  const filtersActive = useMemo(() => Boolean(personId || query.trim()), [personId, query]);

  return (
    <Screen>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 + insets.top, paddingBottom: 24 }}
        ListHeaderComponent={
          <View className="mb-2">
            <PageHeader
              title="Dokumente"
              subtitle="Mit Namen speichern · mehreren Personen zuordenbar"
              action={
                <IconButton icon="add" label="Dokument hinzufügen" onPress={() => router.push('/document/new')} />
              }
            />

            <View className="mb-4 rounded-2xl border border-line bg-paper px-3.5 dark:border-[#2a3f35] dark:bg-[#15241d]">
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Dokumentname suchen…"
                placeholderTextColor={colors.placeholder}
                className="min-h-[48px] font-sans text-base text-ink dark:text-[#e7f2ec]"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            <SectionTitle>Person</SectionTitle>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-2">
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

            {filtersActive ? (
              <Pressable className="mb-3 mt-2 self-start" onPress={() => { setPersonId(''); setQuery(''); }}>
                <Text className="font-sansBold text-sm text-pine-700 dark:text-pine-400">Filter zurücksetzen</Text>
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
            subtitle="Dokument mit Name und Datei hochladen."
          />
        }
        renderItem={({ item, index }) => {
          const expired = Boolean(item.expiryDate && isExpired(item.expiryDate));
          const soon = Boolean(item.expiryDate && isExpiringSoon(item.expiryDate));
          return (
            <ListRow
              index={index}
              title={item.name}
              subtitle={item.personNames}
              meta={
                <View className="flex-row flex-wrap gap-2">
                  {item.documentNumber ? <StatusBadge label={`Nr. ${item.documentNumber}`} /> : null}
                  {item.expiryDate ? (
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

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, EmptyState, ListRow, PageHeader, Screen, StatusBadge } from '@/components/ui';
import { useFamilyStore } from '@/store/familyStore';
import { useAppTheme } from '@/theme/useAppTheme';
import { displayName, formatDateDe, initials } from '@/utils/helpers';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const [query, setQuery] = useState('');
  const people = useFamilyStore((s) => s.people);
  const documents = useFamilyStore((s) => s.documents);
  const refreshDocuments = useFamilyStore((s) => s.refreshDocuments);

  useEffect(() => {
    const t = setTimeout(() => {
      refreshDocuments({ query: query.trim() || undefined });
    }, 200);
    return () => clearTimeout(t);
  }, [query, refreshDocuments]);

  const q = query.trim().toLowerCase();
  const matchedPeople = useMemo(() => {
    if (!q) return [];
    return people.filter((p) =>
      `${p.vorname} ${p.nachname} ${p.email} ${p.telefon}`.toLowerCase().includes(q)
    );
  }, [people, q]);

  const showDocs = q ? documents : [];
  const isEmpty = q.length > 0 && matchedPeople.length === 0 && showDocs.length === 0;

  return (
    <Screen>
      <FlatList
        data={showDocs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 + insets.top, paddingBottom: 24 }}
        ListHeaderComponent={
          <View>
            <PageHeader title="Suche" subtitle="Personen und Dokumentnamen" />
            <View className="mb-5 flex-row items-center rounded-2xl border border-line bg-paper px-3.5 dark:border-[#2a3f35] dark:bg-[#15241d]">
              <Ionicons name="search" size={18} color={colors.mute} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="z. B. Leo, Reisepass Max…"
                placeholderTextColor={colors.placeholder}
                className="ml-2 min-h-[52px] flex-1 font-sans text-base text-ink dark:text-[#e7f2ec]"
                autoCorrect={false}
                clearButtonMode="while-editing"
              />
            </View>

            {!q ? (
              <EmptyState
                icon="search-outline"
                title="Wonach suchst du?"
                subtitle="Tippe einen Personennamen oder Dokumentnamen ein."
              />
            ) : null}

            {matchedPeople.length > 0 ? (
              <View className="mb-4">
                <Text className="mb-2.5 font-sansBold text-[11px] uppercase tracking-[1.4px] text-mute">
                  Personen
                </Text>
                {matchedPeople.map((p, index) => (
                  <ListRow
                    key={p.id}
                    index={index}
                    title={displayName(p.vorname, p.nachname)}
                    subtitle={p.geburtsdatum ? `Geb. ${formatDateDe(p.geburtsdatum)}` : 'Profil öffnen'}
                    leading={<Avatar initials={initials(p.vorname, p.nachname)} size={42} />}
                    onPress={() => router.push(`/person/${p.id}`)}
                  />
                ))}
                {showDocs.length > 0 ? (
                  <Text className="mb-2.5 mt-3 font-sansBold text-[11px] uppercase tracking-[1.4px] text-mute">
                    Dokumente
                  </Text>
                ) : null}
              </View>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          isEmpty ? (
            <EmptyState icon="alert-circle-outline" title="Nichts gefunden" subtitle="Versuch einen anderen Begriff." />
          ) : null
        }
        renderItem={({ item, index }) => (
          <ListRow
            index={index}
            title={item.name}
            subtitle={item.personNames}
            meta={
              item.documentNumber ? <StatusBadge label={item.documentNumber} /> : null
            }
            onPress={() => router.push(`/document/${item.id}`)}
          />
        )}
      />
    </Screen>
  );
}

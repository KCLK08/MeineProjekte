import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, EmptyState, Screen } from '@/components/ui';
import { useFamilyStore } from '@/store/familyStore';

export default function SearchScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const documents = useFamilyStore((s) => s.documents);
  const refreshDocuments = useFamilyStore((s) => s.refreshDocuments);

  useEffect(() => {
    const t = setTimeout(() => {
      refreshDocuments({ query: query.trim() || undefined });
    }, 200);
    return () => clearTimeout(t);
  }, [query, refreshDocuments]);

  return (
    <Screen>
      <View className="px-4 pt-4">
        <Text className="text-2xl font-extrabold text-ink">Suche</Text>
        <Text className="mt-1 text-base text-mist">Name, Dokumentnummer oder Dokumenttyp.</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="z. B. Leo, Reisepass, C01X…"
          placeholderTextColor="#6b7c74"
          className="mt-4 min-h-[48px] rounded-xl border border-line bg-white px-3 text-base text-ink"
          autoCorrect={false}
        />
      </View>
      <FlatList
        data={documents}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
        ListEmptyComponent={
          <EmptyState
            title={query ? 'Nichts gefunden' : 'Tippen Sie zum Suchen'}
            subtitle="Suche durchsucht Personen, Nummern und Typen."
          />
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/document/${item.id}`)} className="mb-3">
            <Card>
              <Text className="text-lg font-bold text-ink">{item.typeName}</Text>
              <Text className="mt-1 text-sm text-mist">{item.personName}</Text>
              {item.documentNumber ? <Text className="mt-1 text-sm text-ink">{item.documentNumber}</Text> : null}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

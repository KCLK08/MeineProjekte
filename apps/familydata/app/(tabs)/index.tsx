import { useRouter } from 'expo-router';
import { FlatList, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, EmptyState, PrimaryButton, Screen } from '@/components/ui';
import { useFamilyStore } from '@/store/familyStore';
import { displayName } from '@/utils/helpers';

export default function FamilyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const people = useFamilyStore((s) => s.people);

  return (
    <Screen>
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="text-2xl font-extrabold text-ink">Familie</Text>
            <Text className="mt-1 text-base text-mist">Digitale Profile – nur Dummy-Testdaten.</Text>
            <View className="mt-4">
              <PrimaryButton label="Person hinzufügen" onPress={() => router.push('/person/new')} />
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState title="Noch niemanden angelegt" subtitle="Fügen Sie das erste Familienmitglied hinzu." />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/person/${item.id}`)} className="mb-3">
            <Card>
              <Text className="text-lg font-bold text-ink">{displayName(item.vorname, item.nachname)}</Text>
              <Text className="mt-1 text-sm text-mist">{item.geburtsdatum || 'Geburtsdatum offen'}</Text>
              {item.notizen ? <Text className="mt-2 text-sm text-forest-700">{item.notizen}</Text> : null}
            </Card>
          </Pressable>
        )}
      />
    </Screen>
  );
}

import { useRouter } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  BrandMark,
  EmptyState,
  IconButton,
  ListRow,
  PageHeader,
  Screen,
} from '@/components/ui';
import { useFamilyStore } from '@/store/familyStore';
import { displayName, formatDateDe, initials } from '@/utils/helpers';

export default function FamilyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const people = useFamilyStore((s) => s.people);

  return (
    <Screen>
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12 + insets.top,
          paddingBottom: 24,
        }}
        ListHeaderComponent={
          <View className="mb-2">
            <BrandMark />
            <View className="mt-6">
              <PageHeader
                title="Familie"
                subtitle={`${people.length} ${people.length === 1 ? 'Profil' : 'Profile'} · offline gespeichert`}
                action={<IconButton icon="person-add" label="Person hinzufügen" onPress={() => router.push('/person/new')} />}
              />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Noch niemand angelegt"
            subtitle="Lege das erste Familienmitglied an – Profile bleiben nur auf diesem Gerät."
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            index={index}
            title={displayName(item.vorname, item.nachname)}
            subtitle={item.geburtsdatum ? `Geb. ${formatDateDe(item.geburtsdatum)}` : 'Geburtsdatum offen'}
            leading={<Avatar initials={initials(item.vorname, item.nachname)} />}
            onPress={() => router.push(`/person/${item.id}`)}
          />
        )}
        ListFooterComponent={
          people.length ? (
            <Text className="mt-4 text-center font-sans text-xs text-mute">
              Tippe auf ein Profil, um Kontakte, Ausweise und Dokumente zu sehen.
            </Text>
          ) : null
        }
      />
    </Screen>
  );
}

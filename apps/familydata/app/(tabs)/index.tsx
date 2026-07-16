import { Redirect, useRouter } from 'expo-router';
import { FlatList, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Avatar,
  EmptyState,
  IconButton,
  ListRow,
  Screen,
  StatusBadge,
} from '@/components/ui';
import { useFamilyStore } from '@/store/familyStore';
import { displayName, formatDateDe, initials, roleLabel } from '@/utils/helpers';

export default function FamilyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const people = useFamilyStore((s) => s.people);
  const familyName = useFamilyStore((s) => s.familyName);
  const setupComplete = useFamilyStore((s) => s.setupComplete);
  const ready = useFamilyStore((s) => s.ready);
  const loading = useFamilyStore((s) => s.loading);

  if (ready && !loading && !setupComplete) {
    return <Redirect href="/setup" />;
  }

  return (
    <Screen>
      <FlatList
        data={people}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12 + insets.top,
          paddingBottom: 36,
        }}
        ListHeaderComponent={
          <View className="mb-4">
            <Text className="font-sansMedium text-[12px] uppercase tracking-[1.6px] text-mute dark:text-[#9bb0a6]">
              Deine Familie
            </Text>
            <Text
              className="mt-1 font-display text-[40px] leading-[44px] text-pine-700 dark:text-pine-400"
              style={{ letterSpacing: -1.2 }}
            >
              Familie {familyName || '—'}
            </Text>
            <View className="mt-4 flex-row items-end justify-between gap-3">
              <Text className="flex-1 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
                {people.length} {people.length === 1 ? 'Mitglied' : 'Mitglieder'} · nur auf diesem Gerät
              </Text>
              <IconButton icon="person-add" label="Person hinzufügen" onPress={() => router.push('/person/new')} />
            </View>
          </View>
        }
        ListEmptyComponent={
          <EmptyState
            icon="people-outline"
            title="Noch niemand angelegt"
            subtitle="Lege das erste Familienmitglied an."
          />
        }
        renderItem={({ item, index }) => (
          <ListRow
            index={index}
            title={displayName(item.vorname, item.nachname)}
            subtitle={item.geburtsdatum ? formatDateDe(item.geburtsdatum) : 'Geburtsdatum offen'}
            meta={item.rolle ? <StatusBadge label={roleLabel(item.rolle)} /> : null}
            leading={<Avatar initials={initials(item.vorname, item.nachname)} />}
            onPress={() => router.push(`/person/${item.id}`)}
          />
        )}
      />
    </Screen>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import {
  Avatar,
  InfoRow,
  ListRow,
  LoadingBlock,
  Panel,
  PrimaryButton,
  Screen,
  SectionTitle,
  StatusBadge,
} from '@/components/ui';
import * as repo from '@/db/repository';
import { requireSecureAccess } from '@/security/access';
import { useFamilyStore } from '@/store/familyStore';
import type { IdEntry, Person } from '@/types/models';
import { useAppTheme } from '@/theme/useAppTheme';
import { displayName, formatDateDe, initials, roleLabel } from '@/utils/helpers';

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const removePerson = useFamilyStore((s) => s.removePerson);
  const documents = useFamilyStore((s) => s.documents);
  const refreshDocuments = useFamilyStore((s) => s.refreshDocuments);

  const [person, setPerson] = useState<Person | null>(null);
  const [idEntries, setIdEntries] = useState<IdEntry[]>([]);
  const [idUnlocked, setIdUnlocked] = useState(false);
  const [idLoading, setIdLoading] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setPerson(await repo.getPerson(id));
      setIdUnlocked(false);
      setIdEntries([]);
      await refreshDocuments({ personId: id });
    })();
  }, [id, refreshDocuments]);

  const unlockIdentification = useCallback(async () => {
    if (!id) return;
    setIdLoading(true);
    try {
      const access = await requireSecureAccess('Identifikation freigeben', { force: true });
      if (!access.ok) {
        Alert.alert('Geschützt', access.reason);
        return;
      }
      setIdEntries(await repo.listIdEntries(id));
      setIdUnlocked(true);
    } finally {
      setIdLoading(false);
    }
  }, [id]);

  if (!person) {
    return (
      <Screen>
        <LoadingBlock label="Profil wird geladen…" />
      </Screen>
    );
  }

  const personDocs = documents.filter((d) => d.personIds.includes(person.id));

  function confirmDelete() {
    Alert.alert('Person löschen', 'Profil und zugehörige Dokumente unwiderruflich entfernen?', [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Löschen',
        style: 'destructive',
        onPress: async () => {
          await removePerson(person!.id);
          router.back();
        },
      },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Animated.View entering={FadeInDown.springify().damping(16)} className="mb-5 items-center">
          <Avatar initials={initials(person.vorname, person.nachname)} size={76} />
          <Text
            className="mt-4 font-display text-3xl text-ink dark:text-[#e7f2ec]"
            style={{ letterSpacing: -0.5 }}
          >
            {displayName(person.vorname, person.nachname)}
          </Text>
          <Text className="mt-1 font-sans text-mute dark:text-[#9bb0a6]">
            {person.geburtsdatum ? formatDateDe(person.geburtsdatum) : 'Geburtsdatum offen'}
          </Text>
          {person.rolle ? (
            <View className="mt-3">
              <StatusBadge label={roleLabel(person.rolle)} />
            </View>
          ) : null}
        </Animated.View>

        <PrimaryButton
          label="Profil bearbeiten"
          icon="create-outline"
          onPress={() => router.push(`/person/edit/${person.id}`)}
        />

        <View className="mt-6">
          <SectionTitle>Kontakt</SectionTitle>
          <Panel>
            <InfoRow label="Telefon" value={person.telefon} />
            <InfoRow label="E-Mail" value={person.email} />
            <InfoRow label="Adresse" value={person.adresse} />
          </Panel>
        </View>

        <View className="mt-6">
          <View className="mb-2 flex-row items-center justify-between">
            <SectionTitle>Identifikation</SectionTitle>
            {idUnlocked ? (
              <Pressable
                onPress={() => router.push(`/person/identification/${person.id}`)}
                className="mb-2 flex-row items-center gap-1"
              >
                <Ionicons name="create-outline" size={18} color={colors.pine} />
                <Text className="font-sansBold text-sm text-pine-700 dark:text-pine-400">Bearbeiten</Text>
              </Pressable>
            ) : null}
          </View>
          {!idUnlocked ? (
            <PrimaryButton
              label={idLoading ? 'Prüft…' : 'Mit Sicherheit freigeben'}
              tone="soft"
              icon="lock-closed-outline"
              onPress={unlockIdentification}
              disabled={idLoading}
            />
          ) : idEntries.length === 0 ? (
            <Text className="mb-3 font-sans text-sm text-mute dark:text-[#9bb0a6]">
              Noch keine Identifikationsfelder. Tippe auf Bearbeiten, um eigene anzulegen.
            </Text>
          ) : (
            <Panel>
              {idEntries.map((entry) => (
                <InfoRow key={entry.id} label={entry.label} value={entry.value} />
              ))}
            </Panel>
          )}
        </View>

        <View className="mt-6">
          <View className="mb-2 flex-row items-center justify-between">
            <SectionTitle>Dokumente</SectionTitle>
            <Pressable
              onPress={() => router.push({ pathname: '/document/new', params: { personId: person.id } })}
              className="mb-2 flex-row items-center gap-1"
            >
              <Ionicons name="add-circle-outline" size={18} color={colors.pine} />
              <Text className="font-sansBold text-sm text-pine-700 dark:text-pine-400">Hinzufügen</Text>
            </Pressable>
          </View>
          {personDocs.length === 0 ? (
            <Text className="mb-3 font-sans text-sm text-mute dark:text-[#9bb0a6]">
              Noch keine Dokumente zugeordnet.
            </Text>
          ) : (
            personDocs.map((doc, index) => (
              <ListRow
                key={doc.id}
                index={index}
                title={doc.name}
                subtitle={doc.personNames || doc.documentNumber || 'Dokument'}
                onPress={() => router.push(`/document/${doc.id}`)}
              />
            ))
          )}
        </View>

        <View className="mt-8">
          <PrimaryButton label="Person löschen" tone="ghost" icon="trash-outline" onPress={confirmDelete} />
        </View>
      </ScrollView>
    </Screen>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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
import { useFamilyStore } from '@/store/familyStore';
import type { IdentificationData, Person } from '@/types/models';
import { useAppTheme } from '@/theme/useAppTheme';
import { displayName, formatDateDe, initials } from '@/utils/helpers';

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { colors } = useAppTheme();
  const removePerson = useFamilyStore((s) => s.removePerson);
  const documents = useFamilyStore((s) => s.documents);
  const refreshDocuments = useFamilyStore((s) => s.refreshDocuments);

  const [person, setPerson] = useState<Person | null>(null);
  const [identification, setIdentification] = useState<IdentificationData | null>(null);

  useEffect(() => {
    if (!id) return;
    (async () => {
      setPerson(await repo.getPerson(id));
      setIdentification(await repo.getIdentification(id));
      await refreshDocuments({ personId: id });
    })();
  }, [id, refreshDocuments]);

  if (!person || !identification) {
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
          <Text className="mt-4 font-display text-3xl text-ink" style={{ letterSpacing: -0.5 }}>
            {displayName(person.vorname, person.nachname)}
          </Text>
          <Text className="mt-1 font-sans text-mute">Geb. {formatDateDe(person.geburtsdatum)}</Text>
          <View className="mt-3 flex-row gap-2">
            {person.nationalitaet ? <StatusBadge label={person.nationalitaet} tone="ok" /> : null}
            <StatusBadge label={`${personDocs.length} Dokumente`} />
          </View>
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
            <InfoRow label="Notizen" value={person.notizen} />
          </Panel>
        </View>

        <View className="mt-6">
          <SectionTitle>Identifikation</SectionTitle>
          <Panel>
            <InfoRow label="Reisepass" value={identification.reisepassnummer} />
            <InfoRow label="Personalausweis" value={identification.personalausweisnummer} />
            <InfoRow label="Aufenthaltstitel" value={identification.aufenthaltstitelnummer} />
            <InfoRow label="Führerschein" value={identification.fuehrerscheinnummer} />
            <InfoRow label="Steuer-ID" value={identification.steuerId} />
            <InfoRow label="Krankenversicherung" value={identification.krankenkassenNummer} />
            <InfoRow label="Kindergeld" value={identification.kindergeldNummer} />
          </Panel>
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
            <Text className="mb-3 font-sans text-sm text-mute">Noch keine Dokumente zugeordnet.</Text>
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

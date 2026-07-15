import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Card, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
import * as repo from '@/db/repository';
import { useFamilyStore } from '@/store/familyStore';
import type { IdentificationData, Person } from '@/types/models';
import { displayName, formatDateDe } from '@/utils/helpers';

export default function PersonDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
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
      <Screen className="items-center justify-center">
        <Text className="text-mist">Profil wird geladen…</Text>
      </Screen>
    );
  }

  const personDocs = documents.filter((d) => d.personId === person.id);

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
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <Text className="text-2xl font-extrabold text-ink">{displayName(person.vorname, person.nachname)}</Text>
        <Text className="mt-1 text-mist">Geb. {formatDateDe(person.geburtsdatum)}</Text>

        <View className="mt-4 flex-row gap-2">
          <View className="flex-1">
            <PrimaryButton label="Bearbeiten" onPress={() => router.push(`/person/edit/${person.id}`)} />
          </View>
          <View className="flex-1">
            <PrimaryButton label="Löschen" tone="danger" onPress={confirmDelete} />
          </View>
        </View>

        <View className="mt-6">
          <SectionTitle>Kontaktdaten</SectionTitle>
          <Card>
            <Info label="Nationalität" value={person.nationalitaet} />
            <Info label="Telefon" value={person.telefon} />
            <Info label="E-Mail" value={person.email} />
            <Info label="Adresse" value={person.adresse} />
            <Info label="Notizen" value={person.notizen} />
          </Card>
        </View>

        <View className="mt-6">
          <SectionTitle>Identifikation</SectionTitle>
          <Card>
            <Info label="Reisepass" value={identification.reisepassnummer} />
            <Info label="Personalausweis" value={identification.personalausweisnummer} />
            <Info label="Aufenthaltstitel" value={identification.aufenthaltstitelnummer} />
            <Info label="Führerschein" value={identification.fuehrerscheinnummer} />
            <Info label="Steuer-ID" value={identification.steuerId} />
            <Info label="Krankenversicherung" value={identification.krankenkassenNummer} />
            <Info label="Kindergeld" value={identification.kindergeldNummer} />
          </Card>
        </View>

        <View className="mt-6">
          <SectionTitle>Dokumente ({personDocs.length})</SectionTitle>
          {personDocs.map((doc) => (
            <Pressable key={doc.id} onPress={() => router.push(`/document/${doc.id}`)} className="mb-2">
              <Card>
                <Text className="font-bold text-ink">{doc.typeName}</Text>
                <Text className="text-sm text-mist">{doc.documentNumber || 'ohne Nummer'}</Text>
              </Card>
            </Pressable>
          ))}
          <PrimaryButton
            label="Dokument zuordnen"
            tone="ghost"
            onPress={() => router.push({ pathname: '/document/new', params: { personId: person.id } })}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

function Info({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <View className="mb-3">
      <Text className="text-xs font-bold uppercase text-mist">{label}</Text>
      <Text className="mt-0.5 text-base text-ink">{value}</Text>
    </View>
  );
}

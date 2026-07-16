import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';

import { Field, Panel, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
import * as repo from '@/db/repository';
import { personFormSchema, type PersonFormValues } from '@/schemas/forms';
import { useFamilyStore } from '@/store/familyStore';

const emptyValues: PersonFormValues = {
  vorname: '',
  nachname: '',
  geburtsdatum: '',
  nationalitaet: '',
  telefon: '',
  email: '',
  adresse: '',
  notizen: '',
  reisepassnummer: '',
  personalausweisnummer: '',
  aufenthaltstitelnummer: '',
  fuehrerscheinnummer: '',
  steuerId: '',
  krankenkassenNummer: '',
  kindergeldNummer: '',
};

export default function PersonFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof params.id === 'string' ? params.id : undefined;
  const savePerson = useFamilyStore((s) => s.savePerson);

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PersonFormValues>({
    resolver: zodResolver(personFormSchema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const person = await repo.getPerson(editingId);
      const identification = await repo.getIdentification(editingId);
      if (!person) return;
      reset({
        vorname: person.vorname,
        nachname: person.nachname,
        geburtsdatum: person.geburtsdatum,
        nationalitaet: person.nationalitaet,
        telefon: person.telefon,
        email: person.email,
        adresse: person.adresse,
        notizen: person.notizen,
        ...identification,
      });
    })();
  }, [editingId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const id = await savePerson(
        {
          id: editingId,
          vorname: values.vorname,
          nachname: values.nachname,
          geburtsdatum: values.geburtsdatum || '',
          nationalitaet: values.nationalitaet || '',
          telefon: values.telefon || '',
          email: values.email || '',
          adresse: values.adresse || '',
          notizen: values.notizen || '',
        },
        {
          reisepassnummer: values.reisepassnummer || '',
          personalausweisnummer: values.personalausweisnummer || '',
          aufenthaltstitelnummer: values.aufenthaltstitelnummer || '',
          fuehrerscheinnummer: values.fuehrerscheinnummer || '',
          steuerId: values.steuerId || '',
          krankenkassenNummer: values.krankenkassenNummer || '',
          kindergeldNummer: values.kindergeldNummer || '',
        }
      );
      router.replace(`/person/${id}`);
    } catch (e) {
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute">
          Grunddaten zuerst – Identifikationsnummern sind optional und bleiben lokal.
        </Text>

        <SectionTitle>Person</SectionTitle>
        <Controller control={control} name="vorname" render={({ field: { onChange, value } }) => (
          <Field label="Vorname *" value={value} onChangeText={onChange} error={errors.vorname?.message} />
        )} />
        <Controller control={control} name="nachname" render={({ field: { onChange, value } }) => (
          <Field label="Nachname *" value={value} onChangeText={onChange} error={errors.nachname?.message} />
        )} />
        <Controller control={control} name="geburtsdatum" render={({ field: { onChange, value } }) => (
          <Field label="Geburtsdatum (JJJJ-MM-TT)" value={value} onChangeText={onChange} placeholder="2014-11-21" />
        )} />
        <Controller control={control} name="nationalitaet" render={({ field: { onChange, value } }) => (
          <Field label="Nationalität" value={value} onChangeText={onChange} />
        )} />

        <View className="mt-2">
          <SectionTitle>Kontakt</SectionTitle>
        </View>
        <Controller control={control} name="telefon" render={({ field: { onChange, value } }) => (
          <Field label="Telefon" value={value} onChangeText={onChange} keyboardType="phone-pad" />
        )} />
        <Controller control={control} name="email" render={({ field: { onChange, value } }) => (
          <Field label="E-Mail" value={value} onChangeText={onChange} keyboardType="email-address" autoCapitalize="none" error={errors.email?.message} />
        )} />
        <Controller control={control} name="adresse" render={({ field: { onChange, value } }) => (
          <Field label="Adresse" value={value} onChangeText={onChange} />
        )} />
        <Controller control={control} name="notizen" render={({ field: { onChange, value } }) => (
          <Field label="Notizen" value={value} onChangeText={onChange} multiline />
        )} />

        <View className="mt-2">
          <SectionTitle>Identifikation (optional)</SectionTitle>
        </View>
        <Controller control={control} name="reisepassnummer" render={({ field: { onChange, value } }) => (
          <Field label="Reisepassnummer" value={value} onChangeText={onChange} autoCapitalize="characters" />
        )} />
        <Controller control={control} name="personalausweisnummer" render={({ field: { onChange, value } }) => (
          <Field label="Personalausweisnummer" value={value} onChangeText={onChange} autoCapitalize="characters" />
        )} />
        <Controller control={control} name="aufenthaltstitelnummer" render={({ field: { onChange, value } }) => (
          <Field label="Aufenthaltstitelnummer" value={value} onChangeText={onChange} />
        )} />
        <Controller control={control} name="fuehrerscheinnummer" render={({ field: { onChange, value } }) => (
          <Field label="Führerscheinnummer" value={value} onChangeText={onChange} />
        )} />
        <Controller control={control} name="steuerId" render={({ field: { onChange, value } }) => (
          <Field label="Steuer-ID" value={value} onChangeText={onChange} />
        )} />
        <Controller control={control} name="krankenkassenNummer" render={({ field: { onChange, value } }) => (
          <Field label="Krankenversichertennummer" value={value} onChangeText={onChange} />
        )} />
        <Controller control={control} name="kindergeldNummer" render={({ field: { onChange, value } }) => (
          <Field label="Kindergeldnummer" value={value} onChangeText={onChange} />
        )} />

        <Panel className="mb-5 mt-1 py-1">
          <View className="flex-row items-center justify-between py-2">
            <Text className="flex-1 pr-3 font-sans text-sm leading-5 text-mute">
              Feldverschlüsselung ist vorbereitet und folgt in einem späteren Schritt.
            </Text>
            <Switch value={false} disabled />
          </View>
        </Panel>

        <PrimaryButton
          label={isSubmitting ? 'Speichert…' : 'Speichern'}
          icon="checkmark"
          onPress={onSubmit}
          disabled={isSubmitting}
        />
      </ScrollView>
    </Screen>
  );
}

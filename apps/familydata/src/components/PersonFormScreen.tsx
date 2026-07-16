import { zodResolver } from '@hookform/resolvers/zod';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, ScrollView, Text, View } from 'react-native';

import { Field, FilterChip, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
import * as repo from '@/db/repository';
import { personFormSchema, type PersonFormValues } from '@/schemas/forms';
import { useFamilyStore } from '@/store/familyStore';
import { FAMILY_ROLE_OPTIONS } from '@/types/models';
import { displayName, formatDateDe, parseDateDe, splitFullName } from '@/utils/helpers';

const emptyValues: PersonFormValues = {
  fullName: '',
  rolle: '',
  geburtsdatum: '',
  telefon: '',
  email: '',
  adresse: '',
};

export default function PersonFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const editingId = typeof params.id === 'string' ? params.id : undefined;
  const savePerson = useFamilyStore((s) => s.savePerson);
  const familyName = useFamilyStore((s) => s.familyName);
  const [askIdAfterSave, setAskIdAfterSave] = useState(!editingId);

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
      if (!person) return;
      reset({
        fullName: displayName(person.vorname, person.nachname),
        rolle: person.rolle || '',
        geburtsdatum: person.geburtsdatum ? formatDateDe(person.geburtsdatum) : '',
        telefon: person.telefon,
        email: person.email,
        adresse: person.adresse,
      });
    })();
  }, [editingId, reset]);

  const onSubmit = handleSubmit(async (values) => {
    try {
      const split = splitFullName(values.fullName);
      const id = await savePerson({
        id: editingId,
        vorname: split.vorname,
        nachname: split.nachname || familyName || '',
        rolle: values.rolle || '',
        geburtsdatum: parseDateDe(values.geburtsdatum || '') || '',
        nationalitaet: '',
        telefon: values.telefon || '',
        email: values.email || '',
        adresse: values.adresse || '',
        notizen: '',
      });

      if (!editingId && askIdAfterSave) {
        Alert.alert(
          'Identifikation hinzufügen?',
          'Du kannst eigene Felder anlegen (z. B. Reisepass). Zugriff später nur mit Biometrie/PIN.',
          [
            {
              text: 'Später',
              style: 'cancel',
              onPress: () => router.replace(`/person/${id}`),
            },
            {
              text: 'Ja, hinzufügen',
              onPress: () => router.replace(`/person/identification/${id}`),
            },
          ]
        );
        return;
      }

      router.replace(`/person/${id}`);
    } catch (e) {
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Name und Rolle reichen für den Start. Identifikation ist optional und geschützt.
        </Text>

        <SectionTitle>Person</SectionTitle>
        <Controller
          control={control}
          name="fullName"
          render={({ field: { onChange, value } }) => (
            <Field
              label="Vor- und Nachname *"
              value={value}
              onChangeText={onChange}
              placeholder="z. B. Max Muster"
              autoCapitalize="words"
              error={errors.fullName?.message}
            />
          )}
        />

        <Text className="mb-2 font-sansMedium text-sm text-mute">Rolle</Text>
        <Controller
          control={control}
          name="rolle"
          render={({ field: { value, onChange } }) => (
            <View className="mb-4 flex-row flex-wrap">
              {FAMILY_ROLE_OPTIONS.map((role) => (
                <FilterChip
                  key={role.id}
                  label={role.label}
                  active={value === role.id}
                  onPress={() => onChange(value === role.id ? '' : role.id)}
                />
              ))}
            </View>
          )}
        />

        <Controller
          control={control}
          name="geburtsdatum"
          render={({ field: { onChange, value } }) => (
            <Field
              label="Geburtsdatum (TT-MM-JJJJ)"
              value={value}
              onChangeText={onChange}
              placeholder="12-03-1980"
              keyboardType="numbers-and-punctuation"
              error={errors.geburtsdatum?.message}
            />
          )}
        />

        <View className="mt-2">
          <SectionTitle>Kontakt</SectionTitle>
        </View>
        <Controller
          control={control}
          name="telefon"
          render={({ field: { onChange, value } }) => (
            <Field label="Telefon" value={value} onChangeText={onChange} keyboardType="phone-pad" />
          )}
        />
        <Controller
          control={control}
          name="email"
          render={({ field: { onChange, value } }) => (
            <Field
              label="E-Mail"
              value={value}
              onChangeText={onChange}
              keyboardType="email-address"
              autoCapitalize="none"
              error={errors.email?.message}
            />
          )}
        />
        <Controller
          control={control}
          name="adresse"
          render={({ field: { onChange, value } }) => (
            <Field label="Adresse" value={value} onChangeText={onChange} />
          )}
        />

        {!editingId ? (
          <View className="mb-5 mt-2">
            <SectionTitle>Nach dem Speichern</SectionTitle>
            <FilterChip
              label={askIdAfterSave ? 'Identifikation danach anbieten' : 'Ohne Identifikation fortfahren'}
              active={askIdAfterSave}
              onPress={() => setAskIdAfterSave((v) => !v)}
            />
          </View>
        ) : null}

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

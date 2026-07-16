import { zodResolver } from '@hookform/resolvers/zod';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { FilterChip, Field, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
import * as repo from '@/db/repository';
import { documentFormSchema, type DocumentFormValues } from '@/schemas/forms';
import { useFamilyStore } from '@/store/familyStore';

export default function DocumentFormScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; personId?: string }>();
  const editingId = typeof params.id === 'string' ? params.id : undefined;
  const presetPersonId = typeof params.personId === 'string' ? params.personId : '';

  const people = useFamilyStore((s) => s.people);
  const documentTypes = useFamilyStore((s) => s.documentTypes);
  const saveDocument = useFamilyStore((s) => s.saveDocument);

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DocumentFormValues>({
    resolver: zodResolver(documentFormSchema),
    defaultValues: {
      personId: presetPersonId,
      documentTypeId: '',
      documentNumber: '',
      expiryDate: '',
      notes: '',
      filePath: '',
    },
  });

  const selectedTypeId = watch('documentTypeId');
  const filePath = watch('filePath');
  const selectedType = useMemo(
    () => documentTypes.find((t) => t.id === selectedTypeId),
    [documentTypes, selectedTypeId]
  );

  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const doc = await repo.getDocument(editingId);
      if (!doc) return;
      reset({
        personId: doc.personId,
        documentTypeId: doc.documentTypeId,
        documentNumber: doc.documentNumber,
        expiryDate: doc.expiryDate,
        notes: doc.notes,
        filePath: doc.filePath,
      });
    })();
  }, [editingId, reset]);

  async function pickImage() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Galerie', 'Zugriff benötigt.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ quality: 0.8 });
    if (!result.canceled && result.assets[0]?.uri) {
      setValue('filePath', result.assets[0].uri, { shouldDirty: true });
    }
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setValue('filePath', result.assets[0].uri, { shouldDirty: true });
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      const expiryDate = selectedType?.expiryDateRelevant ? values.expiryDate || '' : '';
      const id = await saveDocument({
        id: editingId,
        personId: values.personId,
        documentTypeId: values.documentTypeId,
        documentNumber: values.documentNumber || '',
        expiryDate,
        filePath: values.filePath || '',
        notes: values.notes || '',
      });
      router.replace(`/document/${id}`);
    } catch (e) {
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute">
          Dokumente gehören immer zu einer Person. Anhänge bleiben nur lokal auf dem Gerät.
        </Text>

        <SectionTitle>Familienmitglied</SectionTitle>
        <Controller
          control={control}
          name="personId"
          render={({ field: { value, onChange } }) => (
            <View className="mb-4 flex-row flex-wrap">
              {people.map((p) => (
                <View key={p.id} className="mb-2">
                  <FilterChip
                    label={`${p.vorname} ${p.nachname}`}
                    active={value === p.id}
                    onPress={() => onChange(p.id)}
                  />
                </View>
              ))}
              {errors.personId ? (
                <Text className="mt-1 w-full font-sans text-sm text-danger">{errors.personId.message}</Text>
              ) : null}
            </View>
          )}
        />

        <SectionTitle>Dokumenttyp</SectionTitle>
        <Controller
          control={control}
          name="documentTypeId"
          render={({ field: { value, onChange } }) => (
            <View className="mb-4 flex-row flex-wrap">
              {documentTypes.map((t) => (
                <View key={t.id} className="mb-2">
                  <FilterChip label={t.name} active={value === t.id} onPress={() => onChange(t.id)} />
                </View>
              ))}
              {errors.documentTypeId ? (
                <Text className="mt-1 w-full font-sans text-sm text-danger">{errors.documentTypeId.message}</Text>
              ) : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="documentNumber"
          render={({ field: { onChange, value } }) => (
            <Field label="Dokumentnummer (optional)" value={value} onChangeText={onChange} />
          )}
        />

        {selectedType?.expiryDateRelevant ? (
          <Controller
            control={control}
            name="expiryDate"
            render={({ field: { onChange, value } }) => (
              <Field label="Ablaufdatum (JJJJ-MM-TT)" value={value} onChangeText={onChange} placeholder="2030-01-01" />
            )}
          />
        ) : (
          <Text className="mb-3.5 font-sans text-sm text-mute">Für diesen Typ ist kein Ablaufdatum vorgesehen.</Text>
        )}

        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, value } }) => (
            <Field label="Notizen" value={value} onChangeText={onChange} multiline />
          )}
        />

        <SectionTitle>Datei / Bild</SectionTitle>
        <View className="mb-3 flex-row gap-2">
          <View className="flex-1">
            <PrimaryButton label="Foto" tone="soft" icon="image-outline" onPress={pickImage} />
          </View>
          <View className="flex-1">
            <PrimaryButton label="Datei" tone="soft" icon="attach-outline" onPress={pickFile} />
          </View>
        </View>
        {filePath ? (
          <Pressable onPress={() => setValue('filePath', '')} className="mb-4">
            <Text className="font-sansMedium text-sm text-pine-700">Anhang gesetzt · tippen zum Entfernen</Text>
          </Pressable>
        ) : (
          <Text className="mb-4 font-sans text-sm text-mute">Optional – lokal am Gerät.</Text>
        )}

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

import { zodResolver } from '@hookform/resolvers/zod';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { FilterChip, Field, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
import * as repo from '@/db/repository';
import { documentFormSchema, type DocumentFormValues } from '@/schemas/forms';
import { useFamilyStore } from '@/store/familyStore';
import { buildPdfFromImageUris, persistAttachment } from '@/utils/files';
import { createId } from '@/utils/helpers';

export default function DocumentFormScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; personId?: string }>();
  const editingId = typeof params.id === 'string' ? params.id : undefined;
  const presetPersonId = typeof params.personId === 'string' ? params.personId : '';

  const people = useFamilyStore((s) => s.people);
  const saveDocument = useFamilyStore((s) => s.saveDocument);
  const [attachmentLabel, setAttachmentLabel] = useState('');

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
      name: '',
      personIds: presetPersonId ? [presetPersonId] : [],
      notes: '',
      filePath: '',
    },
  });

  const filePath = watch('filePath');

  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const doc = await repo.getDocument(editingId);
      if (!doc) return;
      reset({
        name: doc.name,
        personIds: doc.personIds,
        notes: doc.notes,
        filePath: doc.filePath,
      });
      setAttachmentLabel(doc.filePath ? 'Vorhandene Datei behalten' : '');
    })();
  }, [editingId, reset]);

  async function pickImages() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Galerie', 'Zugriff benötigt.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.85,
      allowsMultipleSelection: true,
      selectionLimit: 12,
      mediaTypes: ['images'],
    });
    if (result.canceled || !result.assets?.length) return;

    try {
      const uris = result.assets.map((a) => a.uri).filter(Boolean);
      if (uris.length === 1) {
        setValue('filePath', uris[0], { shouldDirty: true, shouldValidate: true });
        setAttachmentLabel('1 Bild');
        return;
      }
      const pdfUri = await buildPdfFromImageUris(uris, 'dokument');
      setValue('filePath', pdfUri, { shouldDirty: true, shouldValidate: true });
      setAttachmentLabel(`${uris.length} Bilder → 1 PDF (halbe Seite pro Bild)`);
    } catch (e) {
      Alert.alert('Bilder', (e as Error).message);
    }
  }

  async function pickFile() {
    const result = await DocumentPicker.getDocumentAsync({
      copyToCacheDirectory: true,
      multiple: false,
      type: ['application/pdf', 'image/*'],
    });
    if (!result.canceled && result.assets?.[0]?.uri) {
      setValue('filePath', result.assets[0].uri, { shouldDirty: true, shouldValidate: true });
      setAttachmentLabel(result.assets[0].name || 'Datei gesetzt');
    }
  }

  const onSubmit = handleSubmit(async (values) => {
    try {
      const docKey = editingId || createId('doc');
      const persistedPath = await persistAttachment(values.filePath, docKey);
      const existing = editingId ? await repo.getDocument(editingId) : null;
      const id = await saveDocument({
        id: editingId || docKey,
        name: values.name.trim(),
        personIds: values.personIds,
        documentNumber: existing?.documentNumber || '',
        expiryDate: existing?.expiryDate || '',
        filePath: persistedPath,
        notes: values.notes || '',
      });
      router.replace(`/document/${id}`);
    } catch (e) {
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    }
  });

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute">
          Name und Datei sind Pflicht. Mehrere Fotos werden zu einem PDF mit halber Seite pro Bild
          zusammengeführt.
        </Text>

        <Controller
          control={control}
          name="name"
          render={({ field: { onChange, value } }) => (
            <Field
              label="Name"
              value={value}
              onChangeText={onChange}
              placeholder="z. B. Reisepass Max"
              error={errors.name?.message}
            />
          )}
        />

        <SectionTitle>Personen</SectionTitle>
        <Controller
          control={control}
          name="personIds"
          render={({ field: { value, onChange } }) => (
            <View className="mb-4 flex-row flex-wrap">
              {people.map((p) => {
                const active = value.includes(p.id);
                return (
                  <View key={p.id} className="mb-2">
                    <FilterChip
                      label={`${p.vorname} ${p.nachname}`}
                      active={active}
                      onPress={() =>
                        onChange(active ? value.filter((id) => id !== p.id) : [...value, p.id])
                      }
                    />
                  </View>
                );
              })}
              {errors.personIds ? (
                <Text className="mt-1 w-full font-sans text-sm text-danger">{errors.personIds.message}</Text>
              ) : null}
            </View>
          )}
        />

        <Controller
          control={control}
          name="notes"
          render={({ field: { onChange, value } }) => (
            <Field label="Notizen" value={value} onChangeText={onChange} multiline />
          )}
        />

        <SectionTitle>Datei</SectionTitle>
        <View className="mb-3 flex-row gap-2">
          <View className="flex-1">
            <PrimaryButton label="Fotos" tone="soft" icon="images-outline" onPress={() => void pickImages()} />
          </View>
          <View className="flex-1">
            <PrimaryButton label="PDF / Datei" tone="soft" icon="attach-outline" onPress={() => void pickFile()} />
          </View>
        </View>
        {filePath ? (
          <Pressable
            onPress={() => {
              setValue('filePath', '', { shouldValidate: true });
              setAttachmentLabel('');
            }}
            className="mb-4"
          >
            <Text className="font-sansMedium text-sm text-pine-700">
              {attachmentLabel || 'Datei gesetzt'} · tippen zum Entfernen
            </Text>
          </Pressable>
        ) : (
          <Text className="mb-1 font-sans text-sm text-mute">Erforderlich – lokal am Gerät.</Text>
        )}
        {errors.filePath ? (
          <Text className="mb-4 font-sans text-sm text-danger">{errors.filePath.message}</Text>
        ) : (
          <View className="mb-4" />
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

import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system/legacy';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme/colors';
import { ui } from '@/theme/ui';
import type { PhotoDoc } from '@/types';

function createId(prefix = 'photo') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

async function compressImage(uri: string) {
  const result = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 1600 } }],
    { compress: 0.75, format: ImageManipulator.SaveFormat.JPEG }
  );
  const target = `${FileSystem.documentDirectory}photos/${createId()}.jpg`;
  await FileSystem.copyAsync({ from: result.uri, to: target });
  return target;
}

interface PhotoDocEditorProps {
  photoDoc: PhotoDoc;
  onChange: (next: PhotoDoc) => void;
}

export function PhotoDocEditor({ photoDoc, onChange }: PhotoDocEditorProps) {
  async function addPhoto() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Kamera', 'Kamerazugriff wird für Fotos benötigt.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 1 });
    if (result.canceled || !result.assets?.[0]?.uri) return;

    const photoUri = await compressImage(result.assets[0].uri);
    const next: PhotoDoc = {
      ...photoDoc,
      enabled: true,
      entries: [
        ...photoDoc.entries,
        {
          id: createId('entry'),
          createdAt: new Date().toISOString(),
          mimeType: 'image/jpeg',
          photoUri,
        },
      ],
      updatedAt: new Date().toISOString(),
    };
    onChange(next);
  }

  async function pickFromGallery() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Galerie', 'Galeriezugriff wird für Fotos benötigt.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ quality: 1, allowsMultipleSelection: true });
    if (result.canceled || !result.assets?.length) return;

    const newEntries = [];
    for (const asset of result.assets) {
      const photoUri = await compressImage(asset.uri);
      newEntries.push({
        id: createId('entry'),
        createdAt: new Date().toISOString(),
        mimeType: 'image/jpeg',
        photoUri,
      });
    }

    onChange({
      ...photoDoc,
      enabled: true,
      entries: [...photoDoc.entries, ...newEntries],
      updatedAt: new Date().toISOString(),
    });
  }

  function removeEntry(entryId: string) {
    const entry = photoDoc.entries.find((e) => e.id === entryId);
    if (entry?.photoUri) {
      FileSystem.deleteAsync(entry.photoUri, { idempotent: true }).catch(() => undefined);
    }
    onChange({
      ...photoDoc,
      entries: photoDoc.entries.filter((e) => e.id !== entryId),
      updatedAt: new Date().toISOString(),
    });
  }

  return (
    <View>
      <View style={styles.actions}>
        <Pressable style={styles.button} onPress={addPhoto}>
          <Text style={styles.buttonText}>Foto aufnehmen</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonSecondary]} onPress={pickFromGallery}>
          <Text style={[styles.buttonText, styles.buttonTextSecondary]}>Aus Galerie</Text>
        </Pressable>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.gallery}>
        {photoDoc.entries.map((entry, index) => (
          <View key={entry.id} style={styles.card}>
            <Image source={{ uri: entry.photoUri }} style={styles.image} />
            <Text style={styles.caption}>Bild {index + 1}</Text>
            <Pressable style={styles.remove} onPress={() => removeEntry(entry.id)}>
              <Text style={styles.removeText}>Entfernen</Text>
            </Pressable>
          </View>
        ))}
      </ScrollView>

      {photoDoc.entries.length === 0 ? (
        <Text style={styles.empty}>Noch keine Fotos. Dokumentieren Sie die Baustelle mit Kamera oder Galerie.</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  button: {
    backgroundColor: colors.primary,
    borderRadius: ui.radius.sm,
    flex: 1,
    paddingVertical: 14,
  },
  buttonSecondary: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
    borderWidth: 1,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    textAlign: 'center',
  },
  buttonTextSecondary: {
    color: colors.primary,
  },
  gallery: {
    gap: 12,
    paddingBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    width: 180,
  },
  image: {
    height: 140,
    width: '100%',
  },
  caption: {
    color: colors.textMuted,
    fontSize: 12,
    padding: 8,
  },
  remove: {
    borderTopColor: colors.border,
    borderTopWidth: 1,
    padding: 8,
  },
  removeText: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
    textAlign: 'center',
  },
  empty: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
});

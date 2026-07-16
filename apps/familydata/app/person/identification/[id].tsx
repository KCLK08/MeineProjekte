import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { Field, FilterChip, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
import * as repo from '@/db/repository';
import { requireSecureAccess } from '@/security/access';
import { ID_FIELD_SUGGESTIONS } from '@/types/models';
import { createId } from '@/utils/helpers';

type Draft = { key: string; label: string; value: string };

export default function IdentificationEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [unlocked, setUnlocked] = useState(false);
  const [entries, setEntries] = useState<Draft[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const access = await requireSecureAccess('Identifikation bearbeiten');
      if (!access.ok) {
        Alert.alert('Geschützt', access.reason, [{ text: 'OK', onPress: () => router.back() }]);
        return;
      }
      const existing = await repo.listIdEntries(id);
      setEntries(
        existing.length
          ? existing.map((e) => ({ key: e.id, label: e.label, value: e.value }))
          : [{ key: createId('draft'), label: '', value: '' }]
      );
      setUnlocked(true);
    })();
  }, [id, router]);

  function addSuggestion(label: string) {
    setEntries((prev) => {
      if (prev.some((e) => e.label === label)) return prev;
      const empty = prev.find((e) => !e.label.trim());
      if (empty) {
        return prev.map((e) => (e.key === empty.key ? { ...e, label } : e));
      }
      return [...prev, { key: createId('draft'), label, value: '' }];
    });
  }

  function addCustom() {
    setEntries((prev) => [...prev, { key: createId('draft'), label: '', value: '' }]);
  }

  async function onSave() {
    if (!id) return;
    try {
      setSaving(true);
      await repo.replaceIdEntries(
        id,
        entries.map((e) => ({ label: e.label, value: e.value }))
      );
      router.replace(`/person/${id}`);
    } catch (e) {
      Alert.alert('Speichern fehlgeschlagen', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  if (!unlocked) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-6">
          <Text className="font-sans text-mute">Sicherheitscheck…</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">
        <Text className="mb-4 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Keine festen Felder – wähle Vorschläge oder eigene Bezeichnungen.
        </Text>

        <SectionTitle>Vorschläge</SectionTitle>
        <View className="mb-4 flex-row flex-wrap">
          {ID_FIELD_SUGGESTIONS.map((label) => (
            <FilterChip key={label} label={label} onPress={() => addSuggestion(label)} />
          ))}
        </View>

        <SectionTitle>Einträge</SectionTitle>
        {entries.map((entry, index) => (
          <View key={entry.key} className="mb-3">
            <View className="mb-1 flex-row items-center justify-between">
              <Text className="font-sansBold text-sm text-ink dark:text-[#e7f2ec]">Feld {index + 1}</Text>
              {entries.length > 1 ? (
                <Pressable onPress={() => setEntries((prev) => prev.filter((e) => e.key !== entry.key))}>
                  <Text className="font-sansBold text-sm text-danger">Entfernen</Text>
                </Pressable>
              ) : null}
            </View>
            <Field
              label="Bezeichnung"
              value={entry.label}
              onChangeText={(label) =>
                setEntries((prev) => prev.map((e) => (e.key === entry.key ? { ...e, label } : e)))
              }
              placeholder="z. B. Reisepass"
            />
            <Field
              label="Wert"
              value={entry.value}
              onChangeText={(value) =>
                setEntries((prev) => prev.map((e) => (e.key === entry.key ? { ...e, value } : e)))
              }
              placeholder="Nummer / Inhalt"
            />
          </View>
        ))}

        <PrimaryButton label="Weiteres Feld" tone="soft" icon="add" onPress={addCustom} />
        <View className="mt-3">
          <PrimaryButton
            label={saving ? 'Speichert…' : 'Identifikation speichern'}
            icon="checkmark"
            onPress={onSave}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

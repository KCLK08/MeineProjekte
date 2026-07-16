import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field, FilterChip, PrimaryButton, Screen, SectionTitle } from '@/components/ui';
import { useFamilyStore } from '@/store/familyStore';
import { FAMILY_ROLE_OPTIONS, type FamilyRole } from '@/types/models';
import { parseDateDe, splitFullName } from '@/utils/helpers';

type DraftMember = {
  key: string;
  fullName: string;
  rolle: FamilyRole;
  geburtsdatum: string;
};

export default function FamilySetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const completeSetup = useFamilyStore((s) => s.completeSetup);
  const [familyName, setFamilyName] = useState('');
  const [members, setMembers] = useState<DraftMember[]>([
    { key: 'm1', fullName: '', rolle: 'vater', geburtsdatum: '' },
    { key: 'm2', fullName: '', rolle: 'mutter', geburtsdatum: '' },
  ]);
  const [saving, setSaving] = useState(false);

  const canAddChild = useMemo(() => true, []);

  function updateMember(key: string, patch: Partial<DraftMember>) {
    setMembers((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  function addChild() {
    setMembers((prev) => [
      ...prev,
      { key: `m_${Date.now()}`, fullName: '', rolle: 'kind', geburtsdatum: '' },
    ]);
  }

  function removeMember(key: string) {
    setMembers((prev) => (prev.length <= 1 ? prev : prev.filter((m) => m.key !== key)));
  }

  async function onFinish() {
    const name = familyName.trim();
    if (!name) {
      Alert.alert('Familienname fehlt', 'Bitte den Familiennamen (Nachname) angeben.');
      return;
    }

    const filled = members.filter((m) => m.fullName.trim());
    if (!filled.length) {
      Alert.alert('Mitglied fehlt', 'Mindestens ein Familienmitglied mit Namen anlegen.');
      return;
    }

    for (const m of filled) {
      if (m.geburtsdatum.trim() && !parseDateDe(m.geburtsdatum)) {
        Alert.alert('Datum ungültig', `Geburtsdatum für ${m.fullName} als TT-MM-JJJJ eingeben.`);
        return;
      }
    }

    try {
      setSaving(true);
      await completeSetup({
        familyName: name,
        members: filled.map((m) => {
          const split = splitFullName(m.fullName);
          return {
            vorname: split.vorname,
            nachname: split.nachname || name,
            rolle: m.rolle,
            geburtsdatum: parseDateDe(m.geburtsdatum) || '',
          };
        }),
      });
      router.replace('/(tabs)');
    } catch (e) {
      Alert.alert('Einrichtung fehlgeschlagen', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 16 + insets.top,
          paddingBottom: 40 + insets.bottom,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <Text className="font-display text-3xl text-ink dark:text-[#e7f2ec]" style={{ letterSpacing: -0.6 }}>
          Familie einrichten
        </Text>
        <Text className="mt-2 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Beim ersten Start legst du den Familiennamen und mindestens ein Mitglied an.
        </Text>

        <View className="mt-6">
          <Field
            label="Familienname (Nachname) *"
            value={familyName}
            onChangeText={setFamilyName}
            placeholder="z. B. Muster"
            autoCapitalize="words"
          />
        </View>

        <SectionTitle>Mitglieder</SectionTitle>
        {members.map((member, index) => (
          <View
            key={member.key}
            className="mb-4 rounded-2xl border border-line bg-paper px-3.5 py-3 dark:border-[#2a3f35] dark:bg-[#15241d]"
          >
            <View className="mb-2 flex-row items-center justify-between">
              <Text className="font-sansBold text-sm text-ink dark:text-[#e7f2ec]">
                Person {index + 1}
              </Text>
              {members.length > 1 ? (
                <Pressable onPress={() => removeMember(member.key)}>
                  <Text className="font-sansBold text-sm text-danger">Entfernen</Text>
                </Pressable>
              ) : null}
            </View>

            <Field
              label="Vor- und Nachname *"
              value={member.fullName}
              onChangeText={(fullName) => updateMember(member.key, { fullName })}
              placeholder="z. B. Max Muster"
              autoCapitalize="words"
            />

            <Text className="mb-2 font-sansMedium text-sm text-mute">Rolle</Text>
            <View className="mb-3 flex-row flex-wrap">
              {FAMILY_ROLE_OPTIONS.map((role) => (
                <FilterChip
                  key={role.id}
                  label={role.label}
                  active={member.rolle === role.id}
                  onPress={() => updateMember(member.key, { rolle: role.id })}
                />
              ))}
            </View>

            <Field
              label="Geburtsdatum (TT-MM-JJJJ)"
              value={member.geburtsdatum}
              onChangeText={(geburtsdatum) => updateMember(member.key, { geburtsdatum })}
              placeholder="21-11-2014"
              keyboardType="numbers-and-punctuation"
            />
          </View>
        ))}

        {canAddChild ? (
          <PrimaryButton label="Kind / Person hinzufügen" tone="soft" icon="person-add-outline" onPress={addChild} />
        ) : null}

        <View className="mt-4">
          <PrimaryButton
            label={saving ? 'Speichert…' : 'Familie starten'}
            icon="checkmark"
            onPress={onFinish}
            disabled={saving}
          />
        </View>
      </ScrollView>
    </Screen>
  );
}

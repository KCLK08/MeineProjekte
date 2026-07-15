import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, Screen, SectionTitle } from '@/components/ui';

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 + insets.bottom }}>
        <Text className="text-2xl font-extrabold text-ink">Einstellungen</Text>
        <Text className="mt-1 text-base text-mist">Lokal · offline · keine Cloud.</Text>

        <View className="mt-6">
          <SectionTitle>Verwaltung</SectionTitle>
          <Pressable onPress={() => router.push('/settings/document-types')}>
            <Card className="mb-3">
              <Text className="text-base font-bold text-ink">Dokumenttypen verwalten</Text>
              <Text className="mt-1 text-sm text-mist">Eigene Typen hinzufügen und nutzen.</Text>
            </Card>
          </Pressable>
          <Pressable onPress={() => router.push('/settings/security')}>
            <Card>
              <Text className="text-base font-bold text-ink">Sicherheit</Text>
              <Text className="mt-1 text-sm text-mist">PIN, Biometrie und Verschlüsselung vorbereiten.</Text>
            </Card>
          </Pressable>
        </View>

        <View className="mt-8">
          <SectionTitle>Hinweis</SectionTitle>
          <Card>
            <Text className="text-sm leading-5 text-mist">
              FamilyData speichert nur Testdaten. Keine echten Ausweise, PDFs oder Familieninformationen in Git
              committen. Die Datenbank liegt lokal auf dem Gerät.
            </Text>
          </Card>
        </View>
      </ScrollView>
    </Screen>
  );
}

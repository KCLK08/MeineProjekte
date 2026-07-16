import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark, PageHeader, Screen, SectionTitle } from '@/components/ui';

function SettingsLink({
  title,
  subtitle,
  icon,
  onPress,
  index,
}: {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  index: number;
}) {
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        className="mb-2.5 flex-row items-center gap-3 rounded-2xl border border-line bg-paper px-3.5 py-4 active:bg-pine-50"
      >
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-pine-100">
          <Ionicons name={icon} size={20} color="#0c3b2e" />
        </View>
        <View className="flex-1">
          <Text className="font-sansBold text-[16px] text-ink">{title}</Text>
          <Text className="mt-0.5 font-sans text-sm text-mute">{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color="#5a7368" />
      </Pressable>
    </Animated.View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 + insets.top, paddingBottom: 28 + insets.bottom }}
      >
        <BrandMark compact />
        <View className="mt-5">
          <PageHeader title="Mehr" subtitle="Verwaltung und Schutz · ohne Cloud" />
        </View>

        <SectionTitle>Verwaltung</SectionTitle>
        <SettingsLink
          index={0}
          icon="pricetags-outline"
          title="Dokumenttypen"
          subtitle="Katalog erweitern und pflegen"
          onPress={() => router.push('/settings/document-types')}
        />
        <SettingsLink
          index={1}
          icon="shield-checkmark-outline"
          title="Sicherheit"
          subtitle="PIN und Biometrie vorbereiten"
          onPress={() => router.push('/settings/security')}
        />

        <View className="mt-8">
          <SectionTitle>Über FamilyData</SectionTitle>
          <View className="rounded-2xl border border-line bg-paper px-4 py-4">
            <Text className="font-sans text-[15px] leading-6 text-mute">
              Alles bleibt lokal auf diesem Gerät. Ideal für Familienakten ohne Account und ohne Sync.
              Nutze nur Testdaten, solange du die App ausprobierst.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

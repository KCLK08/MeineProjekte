import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark, PageHeader, Screen, SectionTitle } from '@/components/ui';
import { useAppTheme } from '@/theme/useAppTheme';

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
  const { colors } = useAppTheme();
  return (
    <Animated.View entering={FadeInDown.delay(index * 60).springify().damping(18)}>
      <Pressable
        onPress={onPress}
        className="mb-2.5 flex-row items-center gap-3 rounded-2xl border border-line bg-paper px-3.5 py-4 active:bg-pine-50 dark:border-[#2a3f35] dark:bg-[#15241d] dark:active:bg-[#1a3028]"
      >
        <View className="h-11 w-11 items-center justify-center rounded-2xl bg-pine-100 dark:bg-[#1a3028]">
          <Ionicons name={icon} size={20} color={colors.iconOnSoft} />
        </View>
        <View className="flex-1">
          <Text className="font-sansBold text-[16px] text-ink dark:text-[#e7f2ec]">{title}</Text>
          <Text className="mt-0.5 font-sans text-sm text-mute dark:text-[#9bb0a6]">{subtitle}</Text>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
      </Pressable>
    </Animated.View>
  );
}

function preferenceLabel(preference: 'light' | 'dark' | 'system') {
  if (preference === 'light') return 'Hell';
  if (preference === 'dark') return 'Dunkel';
  return 'System';
}

export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { preference, scheme } = useAppTheme();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12 + insets.top, paddingBottom: 24 }}
      >
        <BrandMark compact />
        <View className="mt-5">
          <PageHeader title="Mehr" subtitle="Verwaltung und Schutz · ohne Cloud" />
        </View>

        <SectionTitle>Darstellung</SectionTitle>
        <SettingsLink
          index={0}
          icon="contrast-outline"
          title="Hell / Dunkel"
          subtitle={`${preferenceLabel(preference)} · gerade ${scheme === 'dark' ? 'dunkel' : 'hell'}`}
          onPress={() => router.push('/settings/appearance')}
        />

        <View className="mt-6">
          <SectionTitle>Verwaltung</SectionTitle>
          <SettingsLink
            index={1}
            icon="pricetags-outline"
            title="Dokumenttypen"
            subtitle="Katalog erweitern und pflegen"
            onPress={() => router.push('/settings/document-types')}
          />
          <SettingsLink
            index={2}
            icon="shield-checkmark-outline"
            title="Sicherheit"
            subtitle="PIN und Biometrie vorbereiten"
            onPress={() => router.push('/settings/security')}
          />
        </View>

        <View className="mt-8">
          <SectionTitle>Über FamilyData</SectionTitle>
          <View className="rounded-2xl border border-line bg-paper px-4 py-4 dark:border-[#2a3f35] dark:bg-[#15241d]">
            <Text className="font-sans text-[15px] leading-6 text-mute dark:text-[#9bb0a6]">
              Alles bleibt lokal auf diesem Gerät. Ideal für Familienakten ohne Account und ohne Sync.
              Nutze nur Testdaten, solange du die App ausprobierst.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

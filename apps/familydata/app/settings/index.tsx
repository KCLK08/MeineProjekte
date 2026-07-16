import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BrandMark, Screen, SectionTitle } from '@/components/ui';
import { useAppTheme } from '@/theme/useAppTheme';

function SettingsLink({
  title,
  subtitle,
  icon,
  onPress,
}: {
  title: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  const { colors } = useAppTheme();
  return (
    <Pressable
      onPress={onPress}
      className="mb-2.5 flex-row items-center gap-3 rounded-2xl border border-line bg-paper px-3.5 py-4 active:bg-pine-50 dark:border-[#2a3f35] dark:bg-[#15241d] dark:active:bg-[#1a3028]"
    >
      <View className="h-11 w-11 items-center justify-center rounded-2xl bg-pine-100 dark:bg-[#1a3028]">
        <Ionicons name={icon} size={20} color={colors.iconOnSoft} />
      </View>
      <View className="flex-1">
        <Text className="font-sansBold text-[16px] text-ink dark:text-[#e7f2ec]">{title}</Text>
        {subtitle ? (
          <Text className="mt-0.5 font-sans text-sm text-mute dark:text-[#9bb0a6]">{subtitle}</Text>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.chevron} />
    </Pressable>
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
  const { preference } = useAppTheme();

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 20,
          paddingTop: 12,
          paddingBottom: 32 + insets.bottom,
        }}
      >
        <BrandMark compact />
        <Text className="mb-5 mt-4 font-display text-3xl text-ink dark:text-[#e7f2ec]">Einstellungen</Text>

        <SettingsLink
          icon="contrast-outline"
          title="Darstellung"
          subtitle={preferenceLabel(preference)}
          onPress={() => router.push('/settings/appearance')}
        />
        <SettingsLink
          icon="shield-checkmark-outline"
          title="Sicherheit"
          subtitle="Sperre & Screenshots"
          onPress={() => router.push('/settings/security')}
        />

        <View className="mt-8">
          <SectionTitle>Über Family Vault</SectionTitle>
          <View className="rounded-2xl border border-line bg-paper px-4 py-4 dark:border-[#2a3f35] dark:bg-[#15241d]">
            <Text className="font-sans text-[15px] leading-6 text-mute dark:text-[#9bb0a6]">
              Family Vault ist eine zentrale App zur Verwaltung persönlicher Familiendaten. Organisieren Sie
              wichtige Informationen wie Ausweise, Dokumente, Notizen und persönliche Angaben aller
              Familienmitglieder übersichtlich an einem Ort.
            </Text>
          </View>
        </View>
      </ScrollView>
    </Screen>
  );
}

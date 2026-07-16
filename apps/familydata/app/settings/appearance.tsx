import { ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen, SectionTitle, ThemeOption } from '@/components/ui';
import type { ThemePreference } from '@/theme/colors';
import { useAppTheme } from '@/theme/useAppTheme';

const OPTIONS: {
  value: ThemePreference;
  label: string;
  subtitle: string;
  icon: 'sunny-outline' | 'moon-outline' | 'phone-portrait-outline';
}[] = [
  {
    value: 'light',
    label: 'Hell',
    subtitle: 'Immer helles Erscheinungsbild',
    icon: 'sunny-outline',
  },
  {
    value: 'dark',
    label: 'Dunkel',
    subtitle: 'Immer dunkles Erscheinungsbild',
    icon: 'moon-outline',
  },
  {
    value: 'system',
    label: 'System',
    subtitle: 'Folgt der Einstellung deines Geräts',
    icon: 'phone-portrait-outline',
  },
];

export default function AppearanceScreen() {
  const insets = useSafeAreaInsets();
  const { preference, setPreference, scheme } = useAppTheme();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Wähle, wie FamilyData aussehen soll. Aktuell aktiv: {scheme === 'dark' ? 'Dunkel' : 'Hell'}.
        </Text>
        <SectionTitle>Modus</SectionTitle>
        {OPTIONS.map((option) => (
          <ThemeOption
            key={option.value}
            label={option.label}
            subtitle={option.subtitle}
            icon={option.icon}
            active={preference === option.value}
            onPress={() => {
              void setPreference(option.value);
            }}
          />
        ))}
      </ScrollView>
    </Screen>
  );
}

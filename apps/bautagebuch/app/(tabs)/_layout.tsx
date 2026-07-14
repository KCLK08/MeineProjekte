import { Image } from 'react-native';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppHeaderTitle } from '@/components/AppHeaderTitle';
import { colors } from '@/theme/colors';

const tabLogo = require('../../assets/images/bautagebuch-logo.png');

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 54 + bottomInset,
          paddingBottom: bottomInset,
          paddingTop: 8,
        },
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '800' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Bautagebücher',
          headerTitle: () => <AppHeaderTitle title="Bautagebücher" />,
          tabBarLabel: 'BTB',
          tabBarIcon: ({ size }) => (
            <Image source={tabLogo} style={{ width: size, height: size }} resizeMode="contain" />
          ),
        }}
      />
      <Tabs.Screen
        name="templates"
        options={{
          title: 'Vorlagen',
          headerTitle: () => <AppHeaderTitle title="Vorlagen" />,
          tabBarLabel: 'Vorlagen',
          tabBarIcon: ({ color, size }) => <Ionicons name="document-text-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}

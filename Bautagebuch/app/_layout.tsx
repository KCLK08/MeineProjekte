import 'react-native-gesture-handler';
import 'react-native-reanimated';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppHeaderTitle } from '@/components/AppHeaderTitle';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#12534b' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: '700' },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="run/[id]" options={{ headerTitle: () => <AppHeaderTitle title="Bautagebuch" /> }} />
        <Stack.Screen name="setup/[templateId]" options={{ headerTitle: () => <AppHeaderTitle title="Vorlage Setup" /> }} />
      </Stack>
      <StatusBar style="light" />
    </SafeAreaProvider>
  );
}

import '../global.css';

import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { useFamilyStore } from '@/store/familyStore';

export default function RootLayout() {
  const bootstrap = useFamilyStore((s) => s.bootstrap);
  const ready = useFamilyStore((s) => s.ready);
  const loading = useFamilyStore((s) => s.loading);
  const error = useFamilyStore((s) => s.error);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  if (!ready && loading) {
    return (
      <View className="flex-1 items-center justify-center bg-sand">
        <ActivityIndicator size="large" color="#1b4332" />
        <Text className="mt-3 text-mist">FamilyData wird vorbereitet…</Text>
      </View>
    );
  }

  if (error && !ready) {
    return (
      <View className="flex-1 items-center justify-center bg-sand px-6">
        <Text className="text-center text-lg font-bold text-danger">Start fehlgeschlagen</Text>
        <Text className="mt-2 text-center text-mist">{error}</Text>
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="person/[id]" options={{ headerShown: true, title: 'Profil', presentation: 'card' }} />
        <Stack.Screen name="person/new" options={{ headerShown: true, title: 'Person hinzufügen', presentation: 'modal' }} />
        <Stack.Screen name="person/edit/[id]" options={{ headerShown: true, title: 'Person bearbeiten', presentation: 'modal' }} />
        <Stack.Screen name="document/[id]" options={{ headerShown: true, title: 'Dokument', presentation: 'card' }} />
        <Stack.Screen name="document/new" options={{ headerShown: true, title: 'Dokument hinzufügen', presentation: 'modal' }} />
        <Stack.Screen name="document/edit/[id]" options={{ headerShown: true, title: 'Dokument bearbeiten', presentation: 'modal' }} />
        <Stack.Screen
          name="settings/document-types"
          options={{ headerShown: true, title: 'Dokumenttypen', presentation: 'card' }}
        />
        <Stack.Screen name="settings/security" options={{ headerShown: true, title: 'Sicherheit', presentation: 'card' }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

import 'react-native-gesture-handler';
import 'react-native-reanimated';

import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useFamilyStore } from '@/store/familyStore';

SplashScreen.preventAutoHideAsync().catch(() => {
  // Already hidden or unavailable in some Expo Go states.
});

export default function RootLayout() {
  const bootstrap = useFamilyStore((s) => s.bootstrap);
  const ready = useFamilyStore((s) => s.ready);
  const error = useFamilyStore((s) => s.error);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  useEffect(() => {
    if (ready || error) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [ready, error]);

  if (!ready) {
    return (
      <SafeAreaProvider>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f4f1ea', paddingHorizontal: 24 }}>
          {error ? (
            <>
              <Text style={{ textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#b42318' }}>Start fehlgeschlagen</Text>
              <Text style={{ marginTop: 8, textAlign: 'center', color: '#6b7c74' }}>{error}</Text>
              <Pressable
                onPress={() => bootstrap()}
                style={{ marginTop: 20, backgroundColor: '#1b4332', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Erneut versuchen</Text>
              </Pressable>
            </>
          ) : (
            <>
              <ActivityIndicator size="large" color="#1b4332" />
              <Text style={{ marginTop: 12, color: '#6b7c74' }}>FamilyData wird vorbereitet…</Text>
            </>
          )}
        </View>
      </SafeAreaProvider>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

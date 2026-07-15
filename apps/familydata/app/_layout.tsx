import 'react-native-gesture-handler';
import 'react-native-reanimated';

import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useFamilyStore } from '@/store/familyStore';

export default function RootLayout() {
  const bootstrap = useFamilyStore((s) => s.bootstrap);
  const ready = useFamilyStore((s) => s.ready);
  const loading = useFamilyStore((s) => s.loading);
  const error = useFamilyStore((s) => s.error);

  useEffect(() => {
    // Never hold the native splash for DB init – that caused infinite loading in Expo Go.
    SplashScreen.hideAsync().catch(() => undefined);
    bootstrap();
  }, [bootstrap]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {error && !ready ? (
          <View
            style={{
              backgroundColor: '#fef3f2',
              borderBottomColor: '#fecdca',
              borderBottomWidth: 1,
              paddingHorizontal: 16,
              paddingVertical: 10,
            }}
          >
            <Text style={{ color: '#b42318', fontWeight: '700' }}>Datenbank-Start fehlgeschlagen</Text>
            <Text style={{ color: '#6b7c74', marginTop: 4 }}>{error}</Text>
            <Pressable onPress={() => bootstrap()} style={{ marginTop: 8 }}>
              <Text style={{ color: '#1b4332', fontWeight: '700' }}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : null}
        {!ready && loading ? (
          <View style={{ backgroundColor: '#f4f1ea', paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: '#6b7c74' }}>Daten werden geladen…</Text>
          </View>
        ) : null}
        {error && ready ? (
          <View
            style={{
              backgroundColor: '#fff7ed',
              borderBottomColor: '#fed7aa',
              borderBottomWidth: 1,
              paddingHorizontal: 16,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: '#9a3412' }}>{error}</Text>
          </View>
        ) : null}
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

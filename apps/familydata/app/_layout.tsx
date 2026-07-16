import 'react-native-gesture-handler';
import 'react-native-reanimated';

import '../global.css';

import {
  DMSans_400Regular,
  DMSans_500Medium,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import {
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { useFonts } from 'expo-font';
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

  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
    bootstrap();
  }, [bootstrap]);

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#e8f0ec' }} />;
  }

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
            <Text style={{ color: '#b42318', fontFamily: 'DMSans_700Bold' }}>Start fehlgeschlagen</Text>
            <Text style={{ color: '#5a7368', marginTop: 4, fontFamily: 'DMSans_400Regular' }}>{error}</Text>
            <Pressable onPress={() => bootstrap()} style={{ marginTop: 8 }}>
              <Text style={{ color: '#0c3b2e', fontFamily: 'DMSans_700Bold' }}>Erneut versuchen</Text>
            </Pressable>
          </View>
        ) : null}
        {!ready && loading ? (
          <View style={{ backgroundColor: '#d8ebe2', paddingHorizontal: 16, paddingVertical: 8 }}>
            <Text style={{ color: '#5a7368', fontFamily: 'DMSans_400Regular' }}>Daten werden geladen…</Text>
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
            <Text style={{ color: '#9a3412', fontFamily: 'DMSans_400Regular' }}>{error}</Text>
          </View>
        ) : null}
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: '#e8f0ec' },
            headerShadowVisible: false,
            headerTintColor: '#0c3b2e',
            headerTitleStyle: { fontFamily: 'Fraunces_700Bold', fontSize: 18, color: '#10241c' },
            contentStyle: { backgroundColor: '#e8f0ec' },
            headerShown: false,
          }}
        >
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

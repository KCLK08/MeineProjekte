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

import { AppLockGate } from '@/components/AppLockGate';
import { enableScreenshotProtection } from '@/security/screenCaptureSession';
import { useFamilyStore } from '@/store/familyStore';
import { useSecurityStore } from '@/store/securityStore';
import { useThemeStore } from '@/theme/themeStore';
import { useAppTheme } from '@/theme/useAppTheme';

function RootNavigator() {
  const bootstrap = useFamilyStore((s) => s.bootstrap);
  const ready = useFamilyStore((s) => s.ready);
  const loading = useFamilyStore((s) => s.loading);
  const error = useFamilyStore((s) => s.error);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const hydrateSecurity = useSecurityStore((s) => s.hydrate);
  const securityHydrated = useSecurityStore((s) => s.hydrated);
  const securityEnabled = useSecurityStore((s) => s.securityEnabled);
  const isLocked = useSecurityStore((s) => s.isLocked);
  const { scheme, colors } = useAppTheme();

  useEffect(() => {
    hydrateTheme();
    void hydrateSecurity();
  }, [hydrateTheme, hydrateSecurity]);

  useEffect(() => {
    void enableScreenshotProtection();
  }, []);

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!securityHydrated) return;
    // Do not load vault data while locked.
    if (securityEnabled && isLocked) return;
    void bootstrap();
  }, [securityHydrated, securityEnabled, isLocked, bootstrap]);

  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {error && !ready ? (
        <View
          style={{
            backgroundColor: colors.bannerErrorBg,
            borderBottomColor: colors.bannerErrorBorder,
            borderBottomWidth: 1,
            paddingHorizontal: 16,
            paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.danger, fontFamily: 'DMSans_700Bold' }}>Start fehlgeschlagen</Text>
          <Text style={{ color: colors.mute, marginTop: 4, fontFamily: 'DMSans_400Regular' }}>{error}</Text>
          <Pressable onPress={() => bootstrap()} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.pine, fontFamily: 'DMSans_700Bold' }}>Erneut versuchen</Text>
          </Pressable>
        </View>
      ) : null}
      {!ready && loading ? (
        <View style={{ backgroundColor: colors.canvasTop, paddingHorizontal: 16, paddingVertical: 8 }}>
          <Text style={{ color: colors.mute, fontFamily: 'DMSans_400Regular' }}>Daten werden geladen…</Text>
        </View>
      ) : null}
      {error && ready ? (
        <View
          style={{
            backgroundColor: colors.bannerWarnBg,
            borderBottomColor: colors.bannerWarnBorder,
            borderBottomWidth: 1,
            paddingHorizontal: 16,
            paddingVertical: 8,
          }}
        >
          <Text style={{ color: colors.bannerWarnText, fontFamily: 'DMSans_400Regular' }}>{error}</Text>
        </View>
      ) : null}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.header },
          headerShadowVisible: false,
          headerTintColor: colors.pine,
          headerTitleStyle: { fontFamily: 'Fraunces_700Bold', fontSize: 18, color: colors.ink },
          contentStyle: { backgroundColor: colors.canvas },
          headerShown: false,
        }}
      >
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="setup" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="person/[id]" options={{ headerShown: true, title: 'Profil', presentation: 'card' }} />
        <Stack.Screen name="person/new" options={{ headerShown: true, title: 'Person hinzufügen', presentation: 'modal' }} />
        <Stack.Screen name="person/edit/[id]" options={{ headerShown: true, title: 'Person bearbeiten', presentation: 'modal' }} />
        <Stack.Screen
          name="person/identification/[id]"
          options={{ headerShown: true, title: 'Identifikation', presentation: 'modal' }}
        />
        <Stack.Screen name="document/[id]" options={{ headerShown: true, title: 'Vorschau', presentation: 'card' }} />
        <Stack.Screen name="document/new" options={{ headerShown: true, title: 'Dokument hinzufügen', presentation: 'modal' }} />
        <Stack.Screen name="document/edit/[id]" options={{ headerShown: true, title: 'Dokument bearbeiten', presentation: 'modal' }} />
        <Stack.Screen name="settings/index" options={{ headerShown: true, title: 'Einstellungen', presentation: 'card' }} />
        <Stack.Screen name="settings/security" options={{ headerShown: true, title: 'Sicherheit', presentation: 'card' }} />
        <Stack.Screen
          name="settings/appearance"
          options={{ headerShown: true, title: 'Darstellung', presentation: 'card' }}
        />
        <Stack.Screen
          name="settings/transfer/index"
          options={{ headerShown: true, title: 'Geräteübertragung', presentation: 'card' }}
        />
        <Stack.Screen
          name="settings/transfer/host"
          options={{ headerShown: true, title: 'Neues Gerät verbinden', presentation: 'card' }}
        />
        <Stack.Screen
          name="settings/transfer/join"
          options={{ headerShown: true, title: 'Daten übernehmen', presentation: 'card' }}
        />
      </Stack>
      <AppLockGate />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    DMSans_400Regular,
    DMSans_500Medium,
    DMSans_700Bold,
  });

  if (!fontsLoaded) {
    return <View style={{ flex: 1, backgroundColor: '#e8f0ec' }} />;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <RootNavigator />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

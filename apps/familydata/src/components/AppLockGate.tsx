import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSecurityStore } from '@/store/securityStore';
import { useAppTheme } from '@/theme/useAppTheme';

/** Full-screen vault lock – logo + unlock; biometrics prompt automatically. */
export function AppLockGate() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { colors, scheme } = useAppTheme();
  const hydrated = useSecurityStore((s) => s.hydrated);
  const securityEnabled = useSecurityStore((s) => s.securityEnabled);
  const isLocked = useSecurityStore((s) => s.isLocked);
  const busy = useSecurityStore((s) => s.busy);
  const error = useSecurityStore((s) => s.error);
  const unlock = useSecurityStore((s) => s.unlock);
  const sqlCipherSupported = useSecurityStore((s) => s.sqlCipherSupported);
  const autoStarted = useRef(false);

  useEffect(() => {
    if (!hydrated || !securityEnabled || !isLocked || !sqlCipherSupported || busy) return;
    if (autoStarted.current) return;
    autoStarted.current = true;
    void (async () => {
      const ok = await unlock();
      if (ok) {
        router.replace('/(tabs)');
      } else {
        // Allow manual retry via button.
        autoStarted.current = false;
      }
    })();
  }, [hydrated, securityEnabled, isLocked, sqlCipherSupported, busy, unlock, router]);

  useEffect(() => {
    if (isLocked) autoStarted.current = false;
  }, [isLocked]);

  if (!hydrated || !securityEnabled || !isLocked) return null;

  const unsupported = !sqlCipherSupported;

  return (
    <View
      style={{
        ...StyleSheetFill,
        paddingTop: insets.top + 24,
        paddingBottom: insets.bottom + 24,
        paddingHorizontal: 28,
        backgroundColor: colors.canvas,
        zIndex: 1000,
      }}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text
          accessibilityRole="header"
          style={{
            marginBottom: 20,
            fontFamily: 'Fraunces_700Bold',
            fontSize: 34,
            lineHeight: 40,
            letterSpacing: -0.8,
            // Light: deep pine on mint canvas; dark: near-white ink on dark canvas.
            color: scheme === 'dark' ? colors.ink : colors.pine,
            textAlign: 'center',
          }}
        >
          Family Vault
        </Text>
        <Image
          source={require('../../assets/images/FamilyVault.png')}
          style={{ width: 120, height: 120, borderRadius: 28, marginBottom: 28 }}
          contentFit="cover"
          accessibilityLabel="Family Vault Logo"
        />
        {error ? (
          <Text
            style={{
              marginBottom: 16,
              fontFamily: 'DMSans_400Regular',
              fontSize: 14,
              color: colors.danger,
              textAlign: 'center',
            }}
          >
            {error}
          </Text>
        ) : null}
        {unsupported ? (
          <Text
            style={{
              fontFamily: 'DMSans_400Regular',
              fontSize: 14,
              lineHeight: 20,
              color: colors.mute,
              textAlign: 'center',
            }}
          >
            Development Build / APK erforderlich.
          </Text>
        ) : null}
      </View>

      {!unsupported ? (
        <Pressable
          onPress={() => {
            void (async () => {
              const ok = await unlock();
              if (ok) router.replace('/(tabs)');
            })();
          }}
          disabled={busy}
          style={{
            minHeight: 54,
            borderRadius: 16,
            backgroundColor: colors.pine,
            alignItems: 'center',
            justifyContent: 'center',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={{ fontFamily: 'DMSans_700Bold', fontSize: 16, color: '#fff' }}>Entsperren</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const StyleSheetFill = {
  position: 'absolute' as const,
  top: 0,
  right: 0,
  bottom: 0,
  left: 0,
};

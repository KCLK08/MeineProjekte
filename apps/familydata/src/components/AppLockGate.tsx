import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSecurityStore } from '@/store/securityStore';
import { useAppTheme } from '@/theme/useAppTheme';

/** Full-screen vault lock – blocks access until native authentication succeeds. */
export function AppLockGate() {
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const hydrated = useSecurityStore((s) => s.hydrated);
  const securityEnabled = useSecurityStore((s) => s.securityEnabled);
  const isLocked = useSecurityStore((s) => s.isLocked);
  const busy = useSecurityStore((s) => s.busy);
  const error = useSecurityStore((s) => s.error);
  const unlock = useSecurityStore((s) => s.unlock);

  if (!hydrated || !securityEnabled || !isLocked) return null;

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
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.pineSoft,
            marginBottom: 20,
          }}
        >
          <Ionicons name="lock-closed" size={32} color={colors.pine} />
        </View>
        <Text style={{ fontFamily: 'Fraunces_700Bold', fontSize: 28, color: colors.ink, letterSpacing: -0.5 }}>
          FamilyData
        </Text>
        <Text
          style={{
            marginTop: 10,
            fontFamily: 'DMSans_400Regular',
            fontSize: 15,
            lineHeight: 22,
            color: colors.mute,
            textAlign: 'center',
          }}
        >
          Tresor gesperrt. Entsperren mit Biometrie oder Gerätecode.
        </Text>
        {error ? (
          <Text
            style={{
              marginTop: 14,
              fontFamily: 'DMSans_400Regular',
              fontSize: 14,
              color: colors.danger,
              textAlign: 'center',
            }}
          >
            {error}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => void unlock()}
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

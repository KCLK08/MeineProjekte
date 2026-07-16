import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import { FilterChip, Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import { SecurityManager } from '@/security/SecurityManager';
import { AUTO_LOCK_OPTIONS, type AutoLockOption, type BiometricAvailability } from '@/security/types';
import { useSecurityStore } from '@/store/securityStore';
import { useAppTheme } from '@/theme/useAppTheme';

export default function SecurityScreen() {
  const { colors } = useAppTheme();
  const securityEnabled = useSecurityStore((s) => s.securityEnabled);
  const autoLock = useSecurityStore((s) => s.autoLock);
  const sqlCipherSupported = useSecurityStore((s) => s.sqlCipherSupported);
  const busy = useSecurityStore((s) => s.busy);
  const enableSecurity = useSecurityStore((s) => s.enableSecurity);
  const disableSecurity = useSecurityStore((s) => s.disableSecurity);
  const setAutoLock = useSecurityStore((s) => s.setAutoLock);
  const testAuth = useSecurityStore((s) => s.testAuth);

  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);

  const reload = useCallback(async () => {
    setAvailability(await SecurityManager.checkBiometricAvailability());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  async function onToggleSecurity(next: boolean) {
    try {
      if (next) {
        if (!sqlCipherSupported) {
          Alert.alert(
            'Development Build nötig',
            'SQLCipher (Datenbankverschlüsselung) funktioniert nicht in Expo Go. Bitte die FamilyData-APK oder einen Expo Dev Client verwenden.'
          );
          return;
        }
        Alert.alert(
          'Daten schützen?',
          'Familie und Dokumente werden verschlüsselt. Ohne Biometrie/Gerätecode sind sie nicht lesbar.',
          [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: 'Schützen',
              onPress: async () => {
                try {
                  await enableSecurity();
                  Alert.alert('Geschützt', 'Tresor aktiv. Datenbank und Dokumente sind verschlüsselt.');
                } catch (e) {
                  Alert.alert('Aktivierung fehlgeschlagen', (e as Error).message);
                }
              },
            },
          ]
        );
      } else {
        Alert.alert(
          'Schutz entfernen?',
          'Daten werden entschlüsselt. Der Master-Key wird gelöscht. Nur fortfahren, wenn du das bewusst willst.',
          [
            { text: 'Abbrechen', style: 'cancel' },
            {
              text: 'Entfernen',
              style: 'destructive',
              onPress: async () => {
                try {
                  await disableSecurity();
                  Alert.alert('Schutz deaktiviert', 'Daten liegen wieder unverschlüsselt lokal vor.');
                } catch (e) {
                  Alert.alert('Deaktivierung fehlgeschlagen', (e as Error).message);
                }
              },
            },
          ]
        );
      }
    } catch (e) {
      Alert.alert('Sicherheit', (e as Error).message);
    }
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Lokaler Tresor ohne Cloud und ohne eigenes App-Passwort. Schutz über Android Keystore / iOS
          Keychain, Biometrie und Gerätecode.
        </Text>

        <SectionTitle>Status</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-sansBold text-lg text-ink dark:text-[#e7f2ec]">Sicherheit</Text>
              <Text className="mt-1 font-sans text-sm text-mute dark:text-[#9bb0a6]">
                {securityEnabled ? 'Geschützt – SQLCipher + AES-256' : 'Nicht aktiviert'}
              </Text>
            </View>
            <StatusBadge label={securityEnabled ? 'Geschützt' : 'Offen'} tone={securityEnabled ? 'ok' : 'warn'} />
          </View>
          <View className="mt-4 flex-row items-center justify-between">
            <Text className="font-sansMedium text-base text-ink dark:text-[#e7f2ec]">Biometrie / Gerätecode</Text>
            <Switch
              trackColor={{ true: colors.pine }}
              value={securityEnabled}
              disabled={busy}
              onValueChange={(v) => void onToggleSecurity(v)}
            />
          </View>
        </Panel>

        <SectionTitle>Gerät</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <View className="mb-3 flex-row flex-wrap gap-2">
            <StatusBadge
              label={availability?.hasHardware ? 'Biometrie-Hardware' : 'Keine Bio-Hardware'}
              tone={availability?.hasHardware ? 'ok' : 'neutral'}
            />
            <StatusBadge
              label={availability?.isEnrolled ? 'Biometrie eingerichtet' : 'Biometrie offen'}
              tone={availability?.isEnrolled ? 'ok' : 'warn'}
            />
            <StatusBadge
              label={sqlCipherSupported ? 'SQLCipher bereit' : 'Expo Go – Dev Build nötig'}
              tone={sqlCipherSupported ? 'ok' : 'warn'}
            />
          </View>
          <PrimaryButton
            label="Sicherheit testen"
            tone="soft"
            icon="finger-print-outline"
            onPress={async () => {
              const ok = await testAuth();
              Alert.alert(ok ? 'Erfolgreich' : 'Fehlgeschlagen', ok ? 'Native Authentifizierung OK.' : undefined);
            }}
          />
        </Panel>

        <SectionTitle>Automatische Sperre</SectionTitle>
        <View className="mb-5 flex-row flex-wrap">
          {AUTO_LOCK_OPTIONS.map((option) => (
            <FilterChip
              key={option.id}
              label={option.label}
              active={autoLock === option.id}
              onPress={() => void setAutoLock(option.id as AutoLockOption)}
            />
          ))}
        </View>

        {!securityEnabled ? (
          <PrimaryButton
            label={busy ? 'Verschlüsselt…' : 'Alle Daten verschlüsseln'}
            icon="shield-checkmark-outline"
            disabled={busy}
            onPress={() => void onToggleSecurity(true)}
          />
        ) : (
          <Pressable onPress={() => void onToggleSecurity(false)} className="mt-2">
            <Text className="text-center font-sansBold text-sm text-danger">Schutz deaktivieren…</Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

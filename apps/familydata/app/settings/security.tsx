import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';

import { FilterChip, Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import { SecurityManager } from '@/security/SecurityManager';
import { AUTO_LOCK_OPTIONS, type AutoLockOption, type BiometricAvailability } from '@/security/types';
import { useSecurityStore } from '@/store/securityStore';
import { useAppTheme } from '@/theme/useAppTheme';

type VaultStatus = {
  sqlCipherSupported: boolean;
  hasMasterKey: boolean;
  masterKeyAuthBound: boolean;
  hasVaultDb: boolean;
  hasLegacyPlainDb: boolean;
  unlocked: boolean;
};

export default function SecurityScreen() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const securityEnabled = useSecurityStore((s) => s.securityEnabled);
  const autoLock = useSecurityStore((s) => s.autoLock);
  const sqlCipherSupported = useSecurityStore((s) => s.sqlCipherSupported);
  const busy = useSecurityStore((s) => s.busy);
  const isLocked = useSecurityStore((s) => s.isLocked);
  const enableSecurity = useSecurityStore((s) => s.enableSecurity);
  const lock = useSecurityStore((s) => s.lock);
  const setAutoLock = useSecurityStore((s) => s.setAutoLock);
  const testAuth = useSecurityStore((s) => s.testAuth);

  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [vault, setVault] = useState<VaultStatus | null>(null);

  const reload = useCallback(async () => {
    setAvailability(await SecurityManager.checkBiometricAvailability());
    setVault(await SecurityManager.getVaultStatus());
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    void reload();
  }, [reload, isLocked, securityEnabled]);

  async function onMigrateOrSetup() {
    if (!sqlCipherSupported) {
      Alert.alert(
        'Development Build nötig',
        'SQLCipher und auth-gebundener Master Key funktionieren nicht in Expo Go. Bitte die FamilyData-APK oder einen Expo Dev Client verwenden.'
      );
      return;
    }
    const migrating = Boolean(vault?.hasLegacyPlainDb);
    Alert.alert(
      migrating ? 'Klartext → Vault migrieren?' : 'Vault einrichten?',
      migrating
        ? 'Bestehende Klartextdaten werden in den verschlüsselten Tresor überführt. Danach ist kein Klartextbetrieb mehr möglich.'
        : 'Master Key wird erzeugt und an Biometrie/Gerätecode gebunden. Datenbank und Dokumente werden verschlüsselt.',
      [
        { text: 'Abbrechen', style: 'cancel' },
        {
          text: migrating ? 'Migrieren' : 'Einrichten',
          onPress: async () => {
            try {
              await enableSecurity();
              await reload();
              Alert.alert('Geschützt', 'Vault aktiv. Klartextbetrieb ist deaktiviert.');
            } catch (e) {
              Alert.alert('Fehler', (e as Error).message);
            }
          },
        },
      ]
    );
  }

  const needsAction = Boolean(
    sqlCipherSupported && vault && (!vault.hasVaultDb || vault.hasLegacyPlainDb || !vault.hasMasterKey)
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          FamilyData speichert Daten ausschließlich verschlüsselt (SQLCipher + AES-256-GCM). Der Master Key
          ist an Biometrie bzw. Gerätecode gebunden. Klartextbetrieb und Deaktivierung des Schutzes sind
          nicht möglich.
        </Text>

        <SectionTitle>Vault-Status</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <View className="flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-sansBold text-lg text-ink dark:text-[#e7f2ec]">Verschlüsselung</Text>
              <Text className="mt-1 font-sans text-sm text-mute dark:text-[#9bb0a6]">
                {securityEnabled && vault?.hasVaultDb
                  ? 'Aktiv (verpflichtend) – SQLCipher + AES-256'
                  : needsAction
                    ? 'Einrichtung oder Migration ausstehend'
                    : sqlCipherSupported
                      ? 'Vault-Modus (verpflichtend)'
                      : 'Nicht verfügbar in Expo Go'}
              </Text>
            </View>
            <StatusBadge
              label={vault?.hasVaultDb ? 'Vault' : needsAction ? 'Migration' : 'Gesperrt'}
              tone={vault?.hasVaultDb ? 'ok' : 'warn'}
            />
          </View>
          <View className="mt-4 gap-2">
            <StatusBadge
              label={
                vault?.masterKeyAuthBound
                  ? 'Master Key: Auth-gebunden'
                  : vault?.hasMasterKey
                    ? 'Master Key: Legacy (wird umgebunden)'
                    : 'Master Key: fehlt'
              }
              tone={vault?.masterKeyAuthBound ? 'ok' : 'warn'}
            />
            <StatusBadge
              label={vault?.hasLegacyPlainDb ? 'Klartext-DB vorhanden' : 'Keine Klartext-DB'}
              tone={vault?.hasLegacyPlainDb ? 'warn' : 'ok'}
            />
            <StatusBadge label="Android-Backup: deaktiviert" tone="ok" />
            <StatusBadge label="Screenshot-Schutz: FLAG_SECURE" tone="ok" />
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
              label={availability?.isEnrolled ? 'Biometrie eingerichtet' : 'Gerätecode / Biometrie'}
              tone={availability?.canAuthenticate ? 'ok' : 'warn'}
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

        {needsAction ? (
          <PrimaryButton
            label={busy ? 'Bitte warten…' : vault?.hasLegacyPlainDb ? 'Klartext → Vault migrieren' : 'Vault einrichten'}
            icon="shield-checkmark-outline"
            disabled={busy}
            onPress={() => void onMigrateOrSetup()}
          />
        ) : !isLocked ? (
          <PrimaryButton
            label="Jetzt sperren"
            tone="soft"
            icon="lock-closed-outline"
            onPress={() => {
              void lock().then(() => router.back());
            }}
          />
        ) : null}

        <Pressable disabled className="mt-4">
          <Text className="text-center font-sans text-xs leading-5 text-mute dark:text-[#9bb0a6]">
            PDF-Vorschau nutzt gebündeltes PDF.js (offline). Preview-Inhalte, Temporärdateien und Session-Key
            werden beim Sperren entfernt. Der Vault-Schutz kann nicht deaktiviert werden.
          </Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

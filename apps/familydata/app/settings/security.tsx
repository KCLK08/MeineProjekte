import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChip, Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import { SecurityManager } from '@/security/SecurityManager';
import { AUTO_LOCK_OPTIONS, type AutoLockOption } from '@/security/types';
import { useSecurityStore } from '@/store/securityStore';
import { useAppTheme } from '@/theme/useAppTheme';

type VaultStatus = {
  sqlCipherSupported: boolean;
  hasMasterKey: boolean;
  hasVaultDb: boolean;
  hasLegacyPlainDb: boolean;
};

export default function SecurityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const autoLock = useSecurityStore((s) => s.autoLock);
  const sqlCipherSupported = useSecurityStore((s) => s.sqlCipherSupported);
  const busy = useSecurityStore((s) => s.busy);
  const isLocked = useSecurityStore((s) => s.isLocked);
  const screenshotsAllowedThisSession = useSecurityStore((s) => s.screenshotsAllowedThisSession);
  const enableSecurity = useSecurityStore((s) => s.enableSecurity);
  const lock = useSecurityStore((s) => s.lock);
  const setAutoLock = useSecurityStore((s) => s.setAutoLock);
  const setScreenshotsAllowedForSession = useSecurityStore((s) => s.setScreenshotsAllowedForSession);

  const [vault, setVault] = useState<VaultStatus | null>(null);

  const reload = useCallback(async () => {
    const status = await SecurityManager.getVaultStatus();
    setVault({
      sqlCipherSupported: status.sqlCipherSupported,
      hasMasterKey: status.hasMasterKey,
      hasVaultDb: status.hasVaultDb,
      hasLegacyPlainDb: status.hasLegacyPlainDb,
    });
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  useEffect(() => {
    void reload();
  }, [reload, isLocked]);

  async function onMigrateOrSetup() {
    if (!sqlCipherSupported) {
      Alert.alert('Development Build nötig', 'Bitte die Family-Vault-APK verwenden.');
      return;
    }
    try {
      await enableSecurity();
      await reload();
    } catch (e) {
      Alert.alert('Fehler', (e as Error).message);
    }
  }

  const needsAction = Boolean(
    sqlCipherSupported && vault && (!vault.hasVaultDb || vault.hasLegacyPlainDb || !vault.hasMasterKey)
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <SectionTitle>Status</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <View className="flex-row items-center justify-between">
            <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Verschlüsselung</Text>
            <StatusBadge
              label={vault?.hasVaultDb ? 'Aktiv' : needsAction ? 'Einrichten' : '—'}
              tone={vault?.hasVaultDb ? 'ok' : 'warn'}
            />
          </View>
          {vault?.hasLegacyPlainDb ? (
            <Text className="mt-2 font-sans text-sm text-mute dark:text-[#9bb0a6]">
              Alte Klartextdaten gefunden – Migration empfohlen.
            </Text>
          ) : null}
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

        <SectionTitle>Screenshots</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 pr-2">
              <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">
                Für diese Sitzung erlauben
              </Text>
              <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Gilt, bis du die App verlässt. Danach wieder geschützt.
              </Text>
            </View>
            <Switch
              trackColor={{ true: colors.pine }}
              value={screenshotsAllowedThisSession}
              disabled={isLocked || busy}
              onValueChange={(v) => {
                void setScreenshotsAllowedForSession(v).catch((e) =>
                  Alert.alert('Screenshots', (e as Error).message)
                );
              }}
            />
          </View>
        </Panel>

        <SectionTitle>Gerätewechsel</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <Text className="font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
            Daten sind an dieses Gerät gebunden. Bei Verlust oder Wechsel auf ein neues Gerät ist keine
            Wiederherstellung möglich.
          </Text>
        </Panel>

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
      </ScrollView>
    </Screen>
  );
}

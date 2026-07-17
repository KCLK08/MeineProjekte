import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
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
  const [autoLockOpen, setAutoLockOpen] = useState(false);

  const autoLockLabel = useMemo(
    () => AUTO_LOCK_OPTIONS.find((o) => o.id === autoLock)?.label ?? '—',
    [autoLock]
  );

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

  async function onSelectAutoLock(option: AutoLockOption) {
    setAutoLockOpen(false);
    try {
      await setAutoLock(option);
    } catch (e) {
      Alert.alert('Automatische Sperre', (e as Error).message);
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
        <Panel className="mb-5 px-0 py-0">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Automatische Sperre: ${autoLockLabel}`}
            onPress={() => setAutoLockOpen(true)}
            disabled={isLocked || busy}
            className="flex-row items-center justify-between px-4 py-4 active:opacity-80"
          >
            <View className="flex-1 pr-3">
              <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Zeitraum</Text>
              <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Nach Inaktivität wird der Tresor gesperrt.
              </Text>
            </View>
            <View className="flex-row items-center gap-1.5">
              <Text className="font-sansMedium text-[15px] text-pine-700 dark:text-pine-400">
                {autoLockLabel}
              </Text>
              <Ionicons name="chevron-down" size={18} color={colors.chevron} />
            </View>
          </Pressable>
        </Panel>

        <SectionTitle>Screenshots</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 pr-2">
              <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">
                Für diese Sitzung erlauben
              </Text>
              <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Nur nach Biometrie. Gilt, bis du die App verlässt. Danach wieder geschützt.
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

        <SectionTitle>Geräteübertragung</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <Text className="font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
            Sicherer Wechsel auf ein neues Gerät per QR-Pairing. Der Master Key verlässt dieses Gerät nicht.
            Ohne beide Geräte ist keine Wiederherstellung möglich.
          </Text>
          <View className="mt-4">
            <PrimaryButton
              label="Geräteübertragung"
              tone="soft"
              icon="swap-horizontal-outline"
              disabled={isLocked || busy}
              onPress={() => router.push('/settings/transfer' as Href)}
            />
          </View>
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

      <Modal
        visible={autoLockOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAutoLockOpen(false)}
      >
        <Pressable
          className="flex-1 justify-end bg-black/45"
          onPress={() => setAutoLockOpen(false)}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            className="rounded-t-3xl border border-line bg-paper px-4 pb-6 pt-3 dark:border-[#2a3f35] dark:bg-[#15241d]"
            style={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
          >
            <View className="mb-3 items-center">
              <View className="mb-3 h-1 w-10 rounded-full bg-line dark:bg-[#2a3f35]" />
              <Text className="font-sansBold text-lg text-ink dark:text-[#e7f2ec]">
                Automatische Sperre
              </Text>
            </View>
            {AUTO_LOCK_OPTIONS.map((option) => {
              const active = autoLock === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => void onSelectAutoLock(option.id)}
                  className={`mb-2 flex-row items-center justify-between rounded-2xl border px-4 py-3.5 ${
                    active
                      ? 'border-pine-700 bg-pine-100 dark:border-pine-500 dark:bg-[#1a3028]'
                      : 'border-line bg-paper dark:border-[#2a3f35] dark:bg-[#101c17]'
                  }`}
                >
                  <Text className="font-sansMedium text-[15px] text-ink dark:text-[#e7f2ec]">
                    {option.label}
                  </Text>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={colors.pine} /> : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </Screen>
  );
}

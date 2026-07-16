import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FilterChip, Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import {
  SecurityAuditService,
  type SecurityCheckReport,
} from '@/security/SecurityAuditService';
import { SecurityEventLog, type SecurityEvent } from '@/security/SecurityEventLog';
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
  const insets = useSafeAreaInsets();
  const { colors } = useAppTheme();
  const securityEnabled = useSecurityStore((s) => s.securityEnabled);
  const autoLock = useSecurityStore((s) => s.autoLock);
  const sqlCipherSupported = useSecurityStore((s) => s.sqlCipherSupported);
  const busy = useSecurityStore((s) => s.busy);
  const isLocked = useSecurityStore((s) => s.isLocked);
  const screenshotsAllowedThisSession = useSecurityStore((s) => s.screenshotsAllowedThisSession);
  const enableSecurity = useSecurityStore((s) => s.enableSecurity);
  const lock = useSecurityStore((s) => s.lock);
  const setAutoLock = useSecurityStore((s) => s.setAutoLock);
  const setScreenshotsAllowedForSession = useSecurityStore((s) => s.setScreenshotsAllowedForSession);
  const testAuth = useSecurityStore((s) => s.testAuth);

  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [vault, setVault] = useState<VaultStatus | null>(null);
  const [audit, setAudit] = useState<SecurityCheckReport | null>(null);
  const [auditBusy, setAuditBusy] = useState(false);
  const [events, setEvents] = useState<SecurityEvent[]>([]);

  const reload = useCallback(async () => {
    setAvailability(await SecurityManager.checkBiometricAvailability());
    setVault(await SecurityManager.getVaultStatus());
    if (!useSecurityStore.getState().isLocked) {
      setEvents(await SecurityEventLog.listRecent(8));
    }
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
        'SQLCipher und auth-gebundener Master Key funktionieren nicht in Expo Go. Bitte die Family Vault-APK oder einen Expo Dev Client verwenden.'
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

  async function onRunSecurityCheck() {
    setAuditBusy(true);
    try {
      const report = await SecurityAuditService.runSecurityCheck();
      setAudit(report);
    } catch (e) {
      Alert.alert('Prüfung fehlgeschlagen', (e as Error).message);
    } finally {
      setAuditBusy(false);
    }
  }

  const needsAction = Boolean(
    sqlCipherSupported && vault && (!vault.hasVaultDb || vault.hasLegacyPlainDb || !vault.hasMasterKey)
  );

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Family Vault speichert Daten ausschließlich verschlüsselt (SQLCipher + AES-256-GCM). Der Master Key
          ist an Biometrie bzw. Gerätecode gebunden. Klartextbetrieb und Deaktivierung des Schutzes sind
          nicht möglich.
        </Text>

        <SectionTitle>Sicherheitsprüfung</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-1 pr-3">
              <Text className="font-sansBold text-lg text-ink dark:text-[#e7f2ec]">Sicherheitsstatus</Text>
              <Text className="mt-1 font-sans text-sm text-mute dark:text-[#9bb0a6]">
                {audit
                  ? `${audit.status} · Score ${audit.score}/100 · ${audit.passed}/${audit.total} Checks`
                  : 'Lokale Prüfung – keine Daten verlassen das Gerät.'}
              </Text>
            </View>
            {audit ? (
              <StatusBadge label={audit.status} tone={audit.status === 'Sehr gut' ? 'ok' : 'warn'} />
            ) : null}
          </View>

          {audit ? (
            <View className="mb-3 gap-2">
              {audit.checks.map((check) => (
                <View key={check.id} className="flex-row items-start gap-2">
                  <Text
                    className={`font-sansBold text-sm ${check.ok ? 'text-pine-700 dark:text-pine-400' : 'text-danger'}`}
                  >
                    {check.ok ? '✓' : '!'}
                  </Text>
                  <View className="flex-1">
                    <Text className="font-sansMedium text-sm text-ink dark:text-[#e7f2ec]">{check.label}</Text>
                    <Text className="font-sans text-xs text-mute dark:text-[#9bb0a6]">{check.detail}</Text>
                  </View>
                </View>
              ))}
              {audit.recommendations.length ? (
                <View className="mt-2 rounded-xl bg-canvas px-3 py-2 dark:bg-[#152019]">
                  <Text className="mb-1 font-sansBold text-xs text-ink dark:text-[#e7f2ec]">Empfehlungen</Text>
                  {audit.recommendations.map((tip) => (
                    <Text key={tip} className="font-sans text-xs leading-5 text-mute dark:text-[#9bb0a6]">
                      • {tip}
                    </Text>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <PrimaryButton
            label={auditBusy ? 'Prüfe…' : 'Sicherheitsprüfung starten'}
            tone="soft"
            icon="shield-checkmark-outline"
            disabled={auditBusy}
            onPress={() => void onRunSecurityCheck()}
          />
        </Panel>

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
        <Text className="mb-2 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
          Standard: Sofort (empfohlen). Nach der ersten Vault-Einrichtung kannst du die Dauer wählen.
        </Text>
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

        <SectionTitle>Screenshot-Schutz</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <View className="flex-row items-center justify-between gap-3">
            <View className="flex-1 pr-2">
              <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">
                Screenshots für diese Sitzung erlauben
              </Text>
              <Text className="mt-1 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Bis zum nächsten Entsperren. Danach ist der Schutz wieder aktiv.
              </Text>
            </View>
            <Switch
              trackColor={{ true: colors.pine }}
              value={screenshotsAllowedThisSession}
              disabled={isLocked || busy}
              onValueChange={(v) => {
                void setScreenshotsAllowedForSession(v).catch((e) =>
                  Alert.alert('Screenshot-Schutz', (e as Error).message)
                );
              }}
            />
          </View>
          <View className="mt-3">
            <StatusBadge
              label={
                screenshotsAllowedThisSession
                  ? 'Sitzung: Screenshots erlaubt'
                  : 'FLAG_SECURE aktiv'
              }
              tone={screenshotsAllowedThisSession ? 'warn' : 'ok'}
            />
          </View>
        </Panel>

        <SectionTitle>Gerätewechsel</SectionTitle>
        <Panel className="mb-5 px-4 py-4">
          <Text className="font-sans text-[14px] leading-5 text-ink dark:text-[#e7f2ec]">
            Family Vault verwendet gerätegebundene Verschlüsselung.
          </Text>
          <Text className="mt-2 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Bei Verlust des Gerätes oder Wechsel auf ein neues Gerät können Daten ohne den ursprünglichen
            Geräteschlüssel nicht wiederhergestellt werden. Es gibt keine Cloud-Wiederherstellung.
          </Text>
        </Panel>

        {!isLocked && events.length ? (
          <>
            <SectionTitle>Sicherheitsprotokoll</SectionTitle>
            <Panel className="mb-5 px-4 py-4">
              <Text className="mb-3 font-sans text-xs text-mute dark:text-[#9bb0a6]">
                Lokal verschlüsselt. Keine Dokumentnamen, Inhalte oder Schlüssel.
              </Text>
              {events.map((event) => (
                <Text
                  key={event.id}
                  className="mb-2 font-sans text-[13px] leading-5 text-ink dark:text-[#e7f2ec]"
                >
                  {SecurityEventLog.formatDisplay(event)}
                </Text>
              ))}
            </Panel>
          </>
        ) : null}

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

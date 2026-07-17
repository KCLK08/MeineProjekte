import { useRouter, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PairingQrDisplay } from '@/components/PairingQrDisplay';
import { PairingQrScanner } from '@/components/PairingQrScanner';
import { Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { useTransferSession } from '@/deviceTransfer/useTransferSession';
import { beginAutoLockSuppress, endAutoLockSuppress } from '@/security/autoLockSuppress';

function statusLabel(status: string) {
  switch (status) {
    case 'scanning_offer':
      return 'Angebot wird gelesen…';
    case 'showing_accept':
      return 'Antwort-QR anzeigen';
    case 'paired':
      return 'Sicher gekoppelt';
    case 'expired':
      return 'Abgelaufen';
    case 'error':
      return 'Fehler';
    default:
      return 'QR scannen';
  }
}

export default function TransferJoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useTransferSession();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    beginAutoLockSuppress();
    return () => endAutoLockSuppress();
  }, []);

  const acceptQr = TransferSessionManager.getAcceptQr();

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="font-display text-2xl text-ink dark:text-[#e7f2ec]">Daten übernehmen</Text>
          <StatusBadge
            label={statusLabel(session.status)}
            tone={session.status === 'paired' ? 'ok' : session.status === 'expired' || session.status === 'error' ? 'danger' : 'neutral'}
          />
        </View>

        <Text className="mb-5 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
          Scanne den QR-Code auf dem alten Gerät. Danach zeigst du deinen Antwort-QR, damit beide Geräte
          gekoppelt werden. Es werden noch keine Vault-Daten übertragen.
        </Text>

        {session.error ? (
          <Text className="mb-3 font-sans text-sm text-danger">{session.error}</Text>
        ) : null}

        {session.status === 'idle' || session.status === 'error' || session.status === 'expired' ? (
          <>
            <SectionTitle>QR vom alten Gerät</SectionTitle>
            <PairingQrScanner
              hint="Kamerablick auf den Pairing-QR des Senders."
              disabled={busy}
              onScan={(data) => {
                setBusy(true);
                void (async () => {
                  try {
                    await TransferSessionManager.acceptOfferFromQr(data);
                  } catch (e) {
                    Alert.alert('QR ungültig', (e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />
          </>
        ) : null}

        {(session.status === 'showing_accept' || session.status === 'paired') && acceptQr ? (
          <>
            <SectionTitle>Antwort-QR für das alte Gerät</SectionTitle>
            <PairingQrDisplay value={acceptQr} label="Pairing-Antwort" />
            <Text className="mt-3 mb-4 text-center font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Das alte Gerät scannt diesen Code. Bestätigungscode:
            </Text>
            <Text className="mb-4 text-center font-display text-3xl tracking-[4px] text-pine-700 dark:text-pine-400">
              {session.confirmationCode}
            </Text>
            {session.status === 'showing_accept' ? (
              <PrimaryButton
                label="Kopplung bestätigen"
                icon="checkmark-circle-outline"
                onPress={() => {
                  try {
                    TransferSessionManager.markJoinerPaired();
                  } catch (e) {
                    Alert.alert('Pairing', (e as Error).message);
                  }
                }}
              />
            ) : null}
          </>
        ) : null}

        {session.status === 'paired' ? (
          <Panel className="mt-4 px-4 py-4">
            <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Geräte sind gekoppelt</Text>
            <Text className="mt-2 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
              Sicheres Pairing abgeschlossen. Die eigentliche Datenmigration folgt in Phase 3.
            </Text>
            <View className="mt-4">
              <PrimaryButton
                label="Fertig"
                onPress={() => {
                  TransferSessionManager.clear();
                  router.replace('/settings/transfer' as Href);
                }}
              />
            </View>
          </Panel>
        ) : null}

        {session.status === 'expired' || session.status === 'error' ? (
          <View className="mt-4">
            <PrimaryButton
              label="Abbrechen"
              tone="ghost"
              onPress={() => {
                TransferSessionManager.clear();
                router.back();
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

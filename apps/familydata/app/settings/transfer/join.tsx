import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PairingQrDisplay } from '@/components/PairingQrDisplay';
import { PairingQrScanner } from '@/components/PairingQrScanner';
import { SecureChannelPanel } from '@/components/SecureChannelPanel';
import { TransferActionHint } from '@/components/TransferActionHint';
import { Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { requestAbortTransfer } from '@/deviceTransfer/transferUiActions';
import { formatSecurityCode, friendlyTransferError } from '@/deviceTransfer/transferUiCopy';
import { useTransferSession } from '@/deviceTransfer/useTransferSession';
import { useTransportSession } from '@/deviceTransfer/useTransportSession';

function joinStatusLabel(status: string): string {
  switch (status) {
    case 'scanning_offer':
      return 'Code wird gelesen…';
    case 'showing_accept':
      return 'Kopplung bestätigen';
    case 'paired':
      return 'Verbunden';
    case 'expired':
      return 'Abgelaufen';
    case 'error':
      return 'Fehler';
    default:
      return 'Scannen';
  }
}

function leaveToHub(router: ReturnType<typeof useRouter>) {
  void TransferSessionManager.clear().then(() => router.replace('/settings/transfer' as Href));
}

export default function TransferJoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useTransferSession();
  const transport = useTransportSession();
  const [busy, setBusy] = useState(false);

  // Auto-lock stays active. Live QR camera suppresses only while scanning.

  const acceptQr = TransferSessionManager.getAcceptQr();
  const securityCode = formatSecurityCode(session.confirmationCode);
  const needsRecovery =
    session.status === 'expired' ||
    session.status === 'error' ||
    transport.status === 'error';

  const onSasMismatch = () => {
    Alert.alert(
      'Sicherheitscodes',
      'Die Sicherheitscodes stimmen nicht überein.\n\nBreche die Übertragung ab und starte sie erneut.',
      [
        { text: 'Zurück', style: 'cancel' },
        {
          text: 'Übertragung beenden',
          style: 'destructive',
          onPress: () => leaveToHub(router),
        },
      ]
    );
  };

  const restartJoin = () => {
    void TransferSessionManager.clear().then(() => {
      setBusy(false);
    });
  };

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="font-display text-2xl text-ink dark:text-[#e7f2ec]">Daten übernehmen</Text>
          <StatusBadge
            label={joinStatusLabel(session.status)}
            tone={
              session.status === 'paired'
                ? 'ok'
                : needsRecovery
                  ? 'danger'
                  : 'neutral'
            }
          />
        </View>

        {session.error || transport.error ? (
          <Text className="mb-3 font-sans text-sm text-danger">
            {friendlyTransferError(session.error || transport.error)}
          </Text>
        ) : null}

        {needsRecovery ? (
          <Panel className="mb-4 px-4 py-4">
            <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">
              Übertragung unterbrochen
            </Text>
            <Text className="mt-2 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
              Starte die Übertragung auch auf dem alten Gerät erneut.
            </Text>
            <View className="mt-4 gap-2">
              <PrimaryButton label="Neu starten" icon="refresh-outline" onPress={restartJoin} />
              <PrimaryButton
                label="Zurück"
                tone="ghost"
                onPress={() => {
                  void TransferSessionManager.clear().then(() => router.back());
                }}
              />
            </View>
          </Panel>
        ) : null}

        {session.status === 'idle' ||
        ((session.status === 'error' || session.status === 'expired') && !busy) ? (
          <>
            {!needsRecovery ? (
              <>
                <SectionTitle>QR-Code scannen</SectionTitle>
                <Text className="mb-2 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
                  Scanne den Code auf dem alten Gerät.
                </Text>
                <TransferActionHint hint="Als Nächstes: Code auf dem alten Gerät scannen." />
                <View className="mt-3">
                  <PairingQrScanner
                    hint="Kamerablick auf den Code des alten Geräts."
                    disabled={busy}
                    onScan={(data) => {
                      setBusy(true);
                      void (async () => {
                        try {
                          await TransferSessionManager.acceptOfferFromQr(data);
                        } catch (e) {
                          Alert.alert('Code ungültig', friendlyTransferError(e));
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  />
                </View>
              </>
            ) : null}
          </>
        ) : null}

        {(session.status === 'showing_accept' || session.status === 'paired') && acceptQr ? (
          <>
            <SectionTitle>Kopplung bestätigen</SectionTitle>
            <Text className="mb-3 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
              Zeige diesen Code dem alten Gerät, damit es dich bestätigen kann.
            </Text>
            <PairingQrDisplay value={acceptQr} label="Antwortcode" />
            {session.status === 'showing_accept' ? (
              <View className="mt-4">
                <TransferActionHint hint="Warte: Das alte Gerät scannt deinen Antwortcode." />
                <View className="mt-3">
                  <PrimaryButton
                    label="Kopplung bestätigen"
                    icon="checkmark-circle-outline"
                    onPress={() => {
                      try {
                        TransferSessionManager.markJoinerPaired();
                      } catch (e) {
                        Alert.alert('Kopplung', friendlyTransferError(e));
                      }
                    }}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : null}

        {session.status === 'paired' ? (
          <>
            {!session.sasConfirmed ? (
              <Panel className="mt-4 px-4 py-4">
                <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">
                  Gleicher Sicherheitscode?
                </Text>
                <Text className="mt-2 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
                  Vergleiche diesen Code mit dem alten Gerät.
                </Text>
                <Text
                  className="mt-4 mb-4 text-center font-display text-3xl tracking-[4px] text-pine-700 dark:text-pine-400"
                  accessibilityLabel={`Sicherheitscode ${securityCode}`}
                >
                  {securityCode}
                </Text>
                <View className="gap-2">
                  <PrimaryButton
                    label="Code stimmt überein"
                    icon="shield-checkmark-outline"
                    onPress={() => {
                      try {
                        TransferSessionManager.confirmSas();
                      } catch (e) {
                        Alert.alert('Bestätigung', friendlyTransferError(e));
                      }
                    }}
                  />
                  <PrimaryButton
                    label="Codes stimmen nicht überein"
                    tone="ghost"
                    onPress={onSasMismatch}
                  />
                </View>
              </Panel>
            ) : (
              <SecureChannelPanel paired={session.sasConfirmed} />
            )}
            <View className="mt-4">
              <PrimaryButton
                label="Abbrechen"
                tone="ghost"
                onPress={() => requestAbortTransfer(() => leaveToHub(router))}
              />
            </View>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

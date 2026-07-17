import { useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PairingQrDisplay } from '@/components/PairingQrDisplay';
import { PairingQrScanner } from '@/components/PairingQrScanner';
import { SecureChannelPanel } from '@/components/SecureChannelPanel';
import { Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { formatSecurityCode, friendlyTransferError } from '@/deviceTransfer/transferUiCopy';
import { useTransferSession } from '@/deviceTransfer/useTransferSession';

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

export default function TransferJoinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useTransferSession();
  const [busy, setBusy] = useState(false);

  // Auto-lock stays active. Live QR camera suppresses only while scanning.

  const acceptQr = TransferSessionManager.getAcceptQr();
  const securityCode = formatSecurityCode(session.confirmationCode);

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
                : session.status === 'expired' || session.status === 'error'
                  ? 'danger'
                  : 'neutral'
            }
          />
        </View>

        {session.error ? (
          <Text className="mb-3 font-sans text-sm text-danger">
            {friendlyTransferError(session.error)}
          </Text>
        ) : null}

        {session.status === 'idle' || session.status === 'error' || session.status === 'expired' ? (
          <>
            <SectionTitle>QR-Code scannen</SectionTitle>
            <Text className="mb-4 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
              Scanne den QR-Code des alten Geräts.
            </Text>
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
              </Panel>
            ) : (
              <SecureChannelPanel paired={session.sasConfirmed} />
            )}
            <View className="mt-4">
              <PrimaryButton
                label="Abbrechen"
                tone="ghost"
                onPress={() => {
                  void TransferSessionManager.clear().then(() =>
                    router.replace('/settings/transfer' as Href)
                  );
                }}
              />
            </View>
          </>
        ) : null}

        {session.status === 'expired' || session.status === 'error' ? (
          <View className="mt-4">
            <PrimaryButton
              label="Abbrechen"
              tone="ghost"
              onPress={() => {
                void TransferSessionManager.clear().then(() => router.back());
              }}
            />
          </View>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

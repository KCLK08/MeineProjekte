import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PairingQrDisplay } from '@/components/PairingQrDisplay';
import { PairingQrScanner } from '@/components/PairingQrScanner';
import { SecureChannelPanel } from '@/components/SecureChannelPanel';
import { TransferActionHint } from '@/components/TransferActionHint';
import {
  LoadingBlock,
  Panel,
  PrimaryButton,
  Screen,
  SectionTitle,
  StatusBadge,
} from '@/components/ui';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { requestAbortTransfer } from '@/deviceTransfer/transferUiActions';
import { formatSecurityCode, friendlyTransferError } from '@/deviceTransfer/transferUiCopy';
import { useTransferSession } from '@/deviceTransfer/useTransferSession';
import { requireSecureAccess } from '@/security/access';

function hostStatusLabel(status: string, step: string): string {
  if (step === 'boot') return 'Biometrie erforderlich';
  switch (status) {
    case 'creating':
      return 'Wird vorbereitet…';
    case 'showing_offer':
      return 'QR bereit';
    case 'scanning_accept':
      return 'Antwort prüfen…';
    case 'paired':
      return 'Verbunden';
    case 'expired':
      return 'Abgelaufen';
    case 'error':
      return 'Fehler';
    default:
      return 'Bereit';
  }
}

function leaveToHub(router: ReturnType<typeof useRouter>) {
  void TransferSessionManager.clear().then(() => router.replace('/settings/transfer' as Href));
}

export default function TransferHostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useTransferSession();
  const [step, setStep] = useState<'boot' | 'offer' | 'scan_accept'>('boot');
  const [busy, setBusy] = useState(false);

  // Auto-lock stays active on this screen. Only PairingQrScanner (live camera)
  // and requireSecureAccess (biometric) suppress briefly.

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const current = TransferSessionManager.getSnapshot();
        if (
          current.status === 'paired' ||
          current.status === 'showing_offer' ||
          current.status === 'scanning_accept'
        ) {
          setStep(
            current.status === 'paired'
              ? 'offer'
              : current.status === 'scanning_accept'
                ? 'scan_accept'
                : 'offer'
          );
          return;
        }
        setBusy(true);
        try {
          const access = await requireSecureAccess('Geräteübertragung freigeben', { force: true });
          if (!access.ok) {
            Alert.alert('Geschützt', friendlyTransferError(access.reason), [
              { text: 'OK', onPress: () => router.back() },
            ]);
            return;
          }
          if (cancelled) return;
          await TransferSessionManager.startHostOffer();
          if (!cancelled) setStep('offer');
        } catch (e) {
          Alert.alert('Übertragung', friendlyTransferError(e), [
            { text: 'OK', onPress: () => router.back() },
          ]);
        } finally {
          if (!cancelled) setBusy(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [router])
  );

  const offerQr = TransferSessionManager.getOfferQr();
  const securityCode = formatSecurityCode(session.confirmationCode);

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

  if (busy && step === 'boot') {
    return (
      <Screen>
        <View className="flex-1 px-5 pt-6">
          <Text className="mb-2 font-display text-2xl text-ink dark:text-[#e7f2ec]">
            Gerät vorbereiten
          </Text>
          <Text className="mb-6 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
            Biometrie erforderlich
          </Text>
          <LoadingBlock label="Bitte bestätigen…" />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="font-display text-2xl text-ink dark:text-[#e7f2ec]">
            Neues Gerät verbinden
          </Text>
          <StatusBadge
            label={hostStatusLabel(session.status, step)}
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

        {session.status !== 'paired' && step !== 'scan_accept' ? (
          <Panel className="mb-4 px-4 py-3">
            <Text className="font-sansBold text-[13px] text-ink dark:text-[#e7f2ec]">
              1. Gerät vorbereiten
            </Text>
            <Text className="mt-1 font-sans text-[13px] text-mute dark:text-[#9bb0a6]">
              ✓ Freigabe erteilt
            </Text>
          </Panel>
        ) : null}

        {session.status === 'paired' ? (
          <>
            {!session.sasConfirmed ? (
              <Panel className="mb-4 px-4 py-4">
                <SectionTitle>Sicherheitscode vergleichen</SectionTitle>
                <Text className="mb-1 font-sansBold text-base text-ink dark:text-[#e7f2ec]">
                  3. Sicherheitscode vergleichen
                </Text>
                <Text className="mt-2 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
                  Vergleiche diesen Code auf beiden Geräten.
                </Text>
                <Text
                  className="mt-4 text-center font-display text-3xl tracking-[4px] text-pine-700 dark:text-pine-400"
                  accessibilityLabel={`Sicherheitscode ${securityCode}`}
                >
                  {securityCode}
                </Text>
                <View className="mt-4 gap-2">
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
              <>
                <Panel className="mb-2 px-4 py-3">
                  <Text className="font-sansBold text-[13px] text-ink dark:text-[#e7f2ec]">
                    4. Übertragung
                  </Text>
                  <Text className="mt-1 font-sans text-[13px] text-mute dark:text-[#9bb0a6]">
                    Daten werden sicher an das neue Gerät gesendet.
                  </Text>
                </Panel>
                <SecureChannelPanel paired={session.sasConfirmed} />
              </>
            )}
            <View className="mt-4 gap-2">
              <PrimaryButton
                label="Abbrechen"
                tone="ghost"
                onPress={() => requestAbortTransfer(() => leaveToHub(router))}
              />
            </View>
          </>
        ) : null}

        {step === 'offer' && offerQr && session.status !== 'paired' ? (
          <>
            <SectionTitle>Neues Gerät verbinden</SectionTitle>
            <Text className="mb-3 font-sansBold text-base text-ink dark:text-[#e7f2ec]">
              2. Neues Gerät verbinden
            </Text>
            <Text className="mb-4 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
              Zeige diesen Code dem neuen Gerät.
            </Text>
            <PairingQrDisplay value={offerQr} label="Verbindungscode" />
            <Text className="mt-3 text-center font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Neues Gerät scannt diesen Code.
            </Text>
            <TransferActionHint hint="Warte: Das neue Gerät scannt diesen Code." />

            <View className="mt-5 mb-3">
              <PrimaryButton
                label="Antwort vom neuen Gerät scannen"
                icon="scan-outline"
                tone="soft"
                onPress={() => setStep('scan_accept')}
                disabled={session.status === 'expired'}
              />
            </View>
          </>
        ) : null}

        {step === 'scan_accept' && session.status !== 'paired' ? (
          <>
            <SectionTitle>Antwort scannen</SectionTitle>
            <Text className="mb-3 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
              Jetzt den Antwortcode vom neuen Gerät scannen.
            </Text>
            <TransferActionHint hint="Als Nächstes: Antwortcode vom neuen Gerät scannen." />
            <View className="mt-3">
              <PairingQrScanner
                hint="Kamerablick auf den Code des neuen Geräts."
                disabled={session.status === 'expired'}
                onScan={(data) => {
                  try {
                    TransferSessionManager.completeHostFromAcceptQr(data);
                  } catch (e) {
                    Alert.alert('Code ungültig', friendlyTransferError(e));
                  }
                }}
              />
            </View>
            <View className="mt-3">
              <PrimaryButton
                label="Zurück zum eigenen Code"
                tone="ghost"
                onPress={() => setStep('offer')}
              />
            </View>
          </>
        ) : null}

        {session.status === 'expired' || session.status === 'error' ? (
          <View className="mt-4 gap-2">
            <PrimaryButton
              label="Neu starten"
              onPress={() => {
                void (async () => {
                  setStep('boot');
                  setBusy(true);
                  try {
                    const access = await requireSecureAccess('Geräteübertragung freigeben', {
                      force: true,
                    });
                    if (!access.ok) {
                      Alert.alert('Geschützt', friendlyTransferError(access.reason));
                      return;
                    }
                    await TransferSessionManager.startHostOffer();
                    setStep('offer');
                  } catch (e) {
                    Alert.alert('Übertragung', friendlyTransferError(e));
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />
            <PrimaryButton
              label="Zurück"
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

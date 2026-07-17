import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PairingQrDisplay } from '@/components/PairingQrDisplay';
import { PairingQrScanner } from '@/components/PairingQrScanner';
import { SecureChannelPanel } from '@/components/SecureChannelPanel';
import { LoadingBlock, Panel, PrimaryButton, Screen, SectionTitle, StatusBadge } from '@/components/ui';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { useTransferSession } from '@/deviceTransfer/useTransferSession';
import { requireSecureAccess } from '@/security/access';
import { beginAutoLockSuppress, endAutoLockSuppress } from '@/security/autoLockSuppress';

function statusLabel(status: string) {
  switch (status) {
    case 'creating':
      return 'Sitzung wird erstellt…';
    case 'showing_offer':
      return 'QR anzeigen – warte auf Antwort';
    case 'scanning_accept':
      return 'Antwort wird geprüft…';
    case 'paired':
      return 'Sicher gekoppelt';
    case 'expired':
      return 'Abgelaufen';
    case 'error':
      return 'Fehler';
    default:
      return status;
  }
}

export default function TransferHostScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useTransferSession();
  const [step, setStep] = useState<'boot' | 'offer' | 'scan_accept'>('boot');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    beginAutoLockSuppress();
    return () => {
      endAutoLockSuppress();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const current = TransferSessionManager.getSnapshot();
        if (current.status === 'paired' || current.status === 'showing_offer' || current.status === 'scanning_accept') {
          setStep(current.status === 'paired' ? 'offer' : current.status === 'scanning_accept' ? 'scan_accept' : 'offer');
          return;
        }
        setBusy(true);
        try {
          const access = await requireSecureAccess('Geräteübertragung freigeben', { force: true });
          if (!access.ok) {
            Alert.alert('Geschützt', access.reason, [{ text: 'OK', onPress: () => router.back() }]);
            return;
          }
          if (cancelled) return;
          await TransferSessionManager.startHostOffer();
          if (!cancelled) setStep('offer');
        } catch (e) {
          Alert.alert('Pairing', (e as Error).message, [{ text: 'OK', onPress: () => router.back() }]);
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

  if (busy && step === 'boot') {
    return (
      <Screen>
        <LoadingBlock label="Authentifizierung & Sitzung…" />
      </Screen>
    );
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 + insets.bottom }}>
        <View className="mb-4 flex-row items-center justify-between">
          <Text className="font-display text-2xl text-ink dark:text-[#e7f2ec]">Neues Gerät verbinden</Text>
          <StatusBadge
            label={statusLabel(session.status)}
            tone={session.status === 'paired' ? 'ok' : session.status === 'expired' || session.status === 'error' ? 'danger' : 'neutral'}
          />
        </View>

        {session.error ? (
          <Text className="mb-3 font-sans text-sm text-danger">{session.error}</Text>
        ) : null}

        {session.status === 'paired' ? (
          <>
            <Panel className="mb-4 px-4 py-4">
              <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Geräte sind gekoppelt</Text>
              <Text className="mt-2 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
                Short Authentication String – muss auf beiden Geräten identisch sein:
              </Text>
              <Text className="mt-3 text-center font-display text-3xl tracking-[4px] text-pine-700 dark:text-pine-400">
                {session.confirmationCode}
              </Text>
              {session.transportHost && session.transportPort ? (
                <Text className="mt-3 text-center font-sans text-xs text-mute dark:text-[#9bb0a6]">
                  Endpoint {session.transportHost}:{session.transportPort}
                </Text>
              ) : null}
              {!session.sasConfirmed ? (
                <View className="mt-4">
                  <PrimaryButton
                    label="Code stimmt überein"
                    icon="shield-checkmark-outline"
                    onPress={() => {
                      try {
                        TransferSessionManager.confirmSas();
                      } catch (e) {
                        Alert.alert('Bestätigung', (e as Error).message);
                      }
                    }}
                  />
                  <Text className="mt-2 text-center font-sans text-[12px] text-mute dark:text-[#9bb0a6]">
                    Erst nach Bestätigung kann der sichere Kanal geöffnet werden.
                  </Text>
                </View>
              ) : null}
            </Panel>
            <SecureChannelPanel paired={session.sasConfirmed} />
            <View className="mt-4 gap-2">
              <PrimaryButton
                label="Fertig"
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

        {step === 'offer' && offerQr && session.status !== 'paired' ? (
          <>
            <SectionTitle>1. QR auf dem neuen Gerät scannen</SectionTitle>
            <PairingQrDisplay value={offerQr} label="Pairing-Angebot" />
            <Text className="mt-3 mb-5 text-center font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Enthält Sitzungs-ID, temporäre Gerätekennung, öffentlichen Schlüssel, Ablaufzeit sowie host/port für
              den lokalen Kanal.
            </Text>

            {session.expiresAt ? (
              <Text className="mb-4 text-center font-sans text-xs text-mute dark:text-[#9bb0a6]">
                Gültig bis {new Date(session.expiresAt).toLocaleTimeString()}
              </Text>
            ) : null}

            <SectionTitle>2. Antwort-QR vom neuen Gerät</SectionTitle>
            {step === 'offer' ? (
              <View className="mb-3">
                <PrimaryButton
                  label="Antwort-QR scannen"
                  icon="scan-outline"
                  tone="soft"
                  onPress={() => setStep('scan_accept')}
                  disabled={session.status === 'expired'}
                />
              </View>
            ) : null}
          </>
        ) : null}

        {step === 'scan_accept' && session.status !== 'paired' ? (
          <>
            <SectionTitle>Antwort scannen</SectionTitle>
            <PairingQrScanner
              hint="Scanne den QR-Code, den das neue Gerät anzeigt."
              disabled={session.status === 'expired'}
              onScan={(data) => {
                try {
                  TransferSessionManager.completeHostFromAcceptQr(data);
                } catch (e) {
                  Alert.alert('Antwort ungültig', (e as Error).message);
                }
              }}
            />
            <View className="mt-3">
              <PrimaryButton label="Zurück zum eigenen QR" tone="ghost" onPress={() => setStep('offer')} />
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
                    const access = await requireSecureAccess('Geräteübertragung freigeben', { force: true });
                    if (!access.ok) {
                      Alert.alert('Geschützt', access.reason);
                      return;
                    }
                    await TransferSessionManager.startHostOffer();
                    setStep('offer');
                  } catch (e) {
                    Alert.alert('Pairing', (e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            />
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

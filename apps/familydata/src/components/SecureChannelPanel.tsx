import { Alert, Text, View } from 'react-native';

import { Panel, PrimaryButton, SectionTitle, StatusBadge } from '@/components/ui';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';
import { useTransportSession } from '@/deviceTransfer/useTransportSession';

function transportTone(status: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (status === 'connected') return 'ok';
  if (status === 'connecting') return 'warn';
  if (status === 'error') return 'danger';
  return 'neutral';
}

function transportLabel(status: string): string {
  switch (status) {
    case 'connecting':
      return 'Verbindet…';
    case 'connected':
      return 'Kanal aktiv';
    case 'error':
      return 'Fehler';
    case 'closed':
      return 'Geschlossen';
    default:
      return 'Kanal bereit';
  }
}

/**
 * Phase 3 UI: open AEAD channel and exchange the fixed test string.
 */
export function SecureChannelPanel({ paired }: { paired: boolean }) {
  const transport = useTransportSession();

  if (!paired) return null;

  return (
    <View className="mt-4">
      <SectionTitle>Sicherer Kanal (Phase 3)</SectionTitle>
      <Panel className="px-4 py-4">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Transport</Text>
          <StatusBadge label={transportLabel(transport.status)} tone={transportTone(transport.status)} />
        </View>
        <Text className="mb-3 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
          TCP + AES-256-GCM (Session-Key aus X25519→HKDF). Keine Vault-Daten – nur Testnachricht. Zuerst das alte
          Gerät (Host) öffnen, danach das neue Gerät verbinden.
        </Text>

        {transport.error ? (
          <Text className="mb-3 font-sans text-sm text-danger">{transport.error}</Text>
        ) : null}

        {transport.lastReceived?.type === 'test' ? (
          <View className="mb-3 rounded-2xl bg-pine-100 px-3 py-3 dark:bg-[#1a3028]">
            <Text className="font-sansMedium text-xs uppercase tracking-wide text-mute dark:text-[#9bb0a6]">
              Empfangen
            </Text>
            <Text className="mt-1 font-sansBold text-[16px] text-ink dark:text-[#e7f2ec]">
              {transport.lastReceived.payload}
            </Text>
          </View>
        ) : null}

        <View className="gap-2">
          {transport.status !== 'connected' && transport.status !== 'connecting' ? (
            <PrimaryButton
              label="Kanal öffnen"
              icon="link-outline"
              onPress={() => {
                const params = TransferSessionManager.getTransportConnectParams();
                if (!params) {
                  Alert.alert('Kanal', 'Pairing unvollständig – kein Session-Material.');
                  return;
                }
                void TransportManager.connect(params).catch((e) =>
                  Alert.alert('Kanal', (e as Error).message)
                );
              }}
            />
          ) : null}
          {transport.status === 'connected' ? (
            <PrimaryButton
              label='Test senden: "FamilyData Transfer Test"'
              icon="paper-plane-outline"
              onPress={() => {
                void TransportManager.sendTestMessage().catch((e) =>
                  Alert.alert('Senden', (e as Error).message)
                );
              }}
            />
          ) : null}
          {transport.status === 'connected' || transport.status === 'connecting' || transport.status === 'error' ? (
            <PrimaryButton
              label="Kanal schließen"
              tone="ghost"
              icon="close-outline"
              onPress={() => TransportManager.close()}
            />
          ) : null}
        </View>

        {transport.log.length ? (
          <View className="mt-4">
            <Text className="mb-1 font-sansMedium text-[11px] uppercase tracking-wide text-mute dark:text-[#9bb0a6]">
              Log
            </Text>
            {transport.log.slice(0, 8).map((line) => (
              <Text key={line} className="font-sans text-[12px] leading-4 text-mute dark:text-[#9bb0a6]">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </Panel>
    </View>
  );
}

import { Alert, Text, View } from 'react-native';

import { Panel, PrimaryButton, SectionTitle, StatusBadge } from '@/components/ui';
import { MigrationTransferService } from '@/deviceTransfer/migration/MigrationTransferService';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';
import { useMigrationTransfer } from '@/deviceTransfer/useMigrationTransfer';
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

function migrationTone(phase: string): 'ok' | 'warn' | 'danger' | 'neutral' {
  if (phase === 'committed' || phase === 'validated') return 'ok';
  if (phase === 'sending' || phase === 'receiving') return 'warn';
  if (phase === 'failed') return 'danger';
  return 'neutral';
}

/**
 * Phase 3 channel + Phase 4A metadata transfer test UI.
 */
export function SecureChannelPanel({ paired }: { paired: boolean }) {
  const transport = useTransportSession();
  const migration = useMigrationTransfer();
  const role = TransferSessionManager.getSnapshot().role;

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
          TCP + AES-256-GCM. Zuerst Host „Kanal öffnen“, danach Joiner verbinden.
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
            {transport.log.slice(0, 6).map((line) => (
              <Text key={line} className="font-sans text-[12px] leading-4 text-mute dark:text-[#9bb0a6]">
                {line}
              </Text>
            ))}
          </View>
        ) : null}
      </Panel>

      {transport.status === 'connected' ? (
        <View className="mt-4">
          <SectionTitle>Metadaten-Transfer (Phase 4A)</SectionTitle>
          <Panel className="px-4 py-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Vault-Metadaten</Text>
              <StatusBadge label={migration.phase} tone={migrationTone(migration.phase)} />
            </View>
            <Text className="mb-3 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Überträgt Tabellenstruktur, Einstellungen und Dokument-Metadaten (keine Dateien, kein Master Key).
              Empfänger speichert nur im Staging und validiert.
            </Text>
            {migration.progress ? (
              <Text className="mb-2 font-sans text-sm text-ink dark:text-[#e7f2ec]">{migration.progress}</Text>
            ) : null}
            {migration.peopleCount != null || migration.documentCount != null ? (
              <Text className="mb-3 font-sans text-[13px] text-mute dark:text-[#9bb0a6]">
                Personen: {migration.peopleCount ?? '—'} · Dokumente (Meta): {migration.documentCount ?? '—'}
              </Text>
            ) : null}
            {migration.error ? (
              <Text className="mb-3 font-sans text-sm text-danger">{migration.error}</Text>
            ) : null}
            {role === 'host' ? (
              <PrimaryButton
                label="Metadaten-Test senden"
                icon="cloud-upload-outline"
                disabled={migration.phase === 'sending'}
                onPress={() => {
                  void MigrationTransferService.sendMetadataTransfer().catch((e) =>
                    Alert.alert('Metadaten', (e as Error).message)
                  );
                }}
              />
            ) : (
              <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Empfänger: wartet automatisch auf Manifest/Chunks und schreibt nur Staging.
              </Text>
            )}
          </Panel>
        </View>
      ) : null}
    </View>
  );
}

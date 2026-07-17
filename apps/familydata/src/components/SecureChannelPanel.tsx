import { Alert, Text, View } from 'react-native';

import { Panel, PrimaryButton, SectionTitle, StatusBadge } from '@/components/ui';
import { DocumentTransferService } from '@/deviceTransfer/migration/DocumentTransferService';
import { MigrationTransferService } from '@/deviceTransfer/migration/MigrationTransferService';
import { VaultCutoverService } from '@/deviceTransfer/migration/VaultCutoverService';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';
import { useDocumentTransfer } from '@/deviceTransfer/useDocumentTransfer';
import { useMigrationTransfer } from '@/deviceTransfer/useMigrationTransfer';
import { useTransportSession } from '@/deviceTransfer/useTransportSession';
import { useVaultCutover } from '@/deviceTransfer/useVaultCutover';
import { useFamilyStore } from '@/store/familyStore';

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
  if (
    phase === 'committed' ||
    phase === 'validated' ||
    phase === 'ready_for_4c' ||
    phase === 'awaiting_sender_choice'
  ) {
    return 'ok';
  }
  if (phase === 'sending' || phase === 'receiving' || phase === 'building' || phase === 'prepared') {
    return 'warn';
  }
  if (phase === 'failed') return 'danger';
  return 'neutral';
}

/**
 * Phase 3 channel + Phase 4A/4B/4C transfer UI.
 */
export function SecureChannelPanel({ paired }: { paired: boolean }) {
  const transport = useTransportSession();
  const migration = useMigrationTransfer();
  const docs = useDocumentTransfer();
  const cutover = useVaultCutover();
  const role = TransferSessionManager.getSnapshot().role;
  const bootstrap = useFamilyStore((s) => s.bootstrap);
  const transferId = migration.transferId;

  if (!paired) return null;

  const canRunCutover =
    role === 'joiner' &&
    migration.phase === 'committed' &&
    docs.phase === 'ready_for_4c' &&
    cutover.phase !== 'building' &&
    cutover.phase !== 'prepared' &&
    cutover.phase !== 'validated' &&
    cutover.phase !== 'committed' &&
    transport.status === 'connected' &&
    Boolean(transferId);

  return (
    <View className="mt-4">
      <SectionTitle>Sicherer Kanal (Phase 3)</SectionTitle>
      <Panel className="px-4 py-4">
        <View className="mb-3 flex-row items-center justify-between">
          <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Transport</Text>
          <StatusBadge label={transportLabel(transport.status)} tone={transportTone(transport.status)} />
        </View>
        <Text className="mb-3 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
          TCP + AES-256-GCM. HKDF: Transport-, Integrity- und Doc-Wrap-Key. Zuerst Host öffnen.
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
              Tabellenstruktur, Einstellungen, Dokument-Metadaten → Staging (keine Dateien, kein Master Key).
            </Text>
            {migration.progress ? (
              <Text className="mb-2 font-sans text-sm text-ink dark:text-[#e7f2ec]">{migration.progress}</Text>
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
                Empfänger: wartet auf Manifest/Chunks (nur Staging).
              </Text>
            )}
          </Panel>
        </View>
      ) : null}

      {transport.status === 'connected' ? (
        <View className="mt-4">
          <SectionTitle>Dokumenttransfer (Phase 4B)</SectionTitle>
          <Panel className="px-4 py-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Doc-Wrap → Staging</Text>
              <StatusBadge label={docs.phase} tone={migrationTone(docs.phase)} />
            </View>
            <Text className="mb-3 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Vault-.dat wird mit Doc-Wrap-Key umgeschlüsselt (Klartext nur RAM). Kein Master-Key-Transfer.
            </Text>
            {docs.progress ? (
              <Text className="mb-2 font-sans text-sm text-ink dark:text-[#e7f2ec]">{docs.progress}</Text>
            ) : null}
            <Text className="mb-3 font-sans text-[13px] text-mute dark:text-[#9bb0a6]">
              Gesendet: {docs.sentCount} · Empfangen: {docs.receivedCount}
            </Text>
            {docs.error ? (
              <Text className="mb-3 font-sans text-sm text-danger">{docs.error}</Text>
            ) : null}
            {role === 'host' ? (
              <PrimaryButton
                label="Dokumente senden (Staging)"
                icon="document-outline"
                disabled={docs.phase === 'sending' || migration.phase !== 'committed'}
                onPress={() => {
                  void DocumentTransferService.sendAllEncryptedDocuments().catch((e) =>
                    Alert.alert('Dokumente', (e as Error).message)
                  );
                }}
              />
            ) : (
              <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Empfänger: speichert Wrap-Ciphertext unter …/documents/ mit Mapping.
              </Text>
            )}
            {migration.phase !== 'committed' && role === 'host' ? (
              <Text className="mt-2 font-sans text-[12px] text-mute dark:text-[#9bb0a6]">
                Zuerst Phase 4A (Metadaten) abschließen.
              </Text>
            ) : null}
          </Panel>
        </View>
      ) : null}

      {transport.status === 'connected' || cutover.phase === 'awaiting_sender_choice' || cutover.phase === 'committed' ? (
        <View className="mt-4">
          <SectionTitle>Vault-Cutover (Phase 4C)</SectionTitle>
          <Panel className="px-4 py-4">
            <View className="mb-3 flex-row items-center justify-between">
              <Text className="font-sansBold text-base text-ink dark:text-[#e7f2ec]">Finale Migration</Text>
              <StatusBadge label={cutover.phase} tone={migrationTone(cutover.phase)} />
            </View>
            <Text className="mb-3 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Neuer Master Key (Keystore), neue SQLCipher-Vault, Dokument-Rekey, atomarer Commit. Kein
              Master-Key-Transfer.
            </Text>
            {cutover.progress ? (
              <Text className="mb-2 font-sans text-sm text-ink dark:text-[#e7f2ec]">{cutover.progress}</Text>
            ) : null}
            {cutover.phase === 'committed' || cutover.people > 0 ? (
              <Text className="mb-3 font-sans text-[13px] text-mute dark:text-[#9bb0a6]">
                Personen: {cutover.people} · Dokumente: {cutover.documents} · Dateien: {cutover.files}
              </Text>
            ) : null}
            {cutover.error ? (
              <Text className="mb-3 font-sans text-sm text-danger">{cutover.error}</Text>
            ) : null}

            {role === 'joiner' && transferId ? (
              <PrimaryButton
                label="Migration starten (neuer Vault)"
                icon="shield-checkmark-outline"
                disabled={!canRunCutover}
                onPress={() => {
                  Alert.alert(
                    'Vault-Cutover',
                    'Es wird eine neue Vault mit neuem Master Key erzeugt. Bestehende Empfänger-Daten werden ersetzt.',
                    [
                      { text: 'Abbrechen', style: 'cancel' },
                      {
                        text: 'Starten',
                        style: 'destructive',
                        onPress: () => {
                          void VaultCutoverService.runCutover(transferId)
                            .then(() => bootstrap())
                            .catch((e) => Alert.alert('Cutover', (e as Error).message));
                        },
                      },
                    ]
                  );
                }}
              />
            ) : null}

            {role === 'host' && cutover.phase === 'awaiting_sender_choice' ? (
              <View className="gap-2">
                <Text className="mb-1 font-sansBold text-sm text-ink dark:text-[#e7f2ec]">
                  Übertragung abgeschlossen.
                </Text>
                <Text className="mb-2 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                  Möchten Sie die Daten auf diesem Gerät behalten oder entfernen?
                </Text>
                <PrimaryButton
                  label="Behalten"
                  icon="checkmark-outline"
                  onPress={() => {
                    VaultCutoverService.markSenderKept();
                    Alert.alert('Sender', 'Daten bleiben auf diesem Gerät.');
                  }}
                />
                <PrimaryButton
                  label="Sicher löschen"
                  tone="ghost"
                  icon="trash-outline"
                  onPress={() => {
                    Alert.alert(
                      'Sicher löschen',
                      'Alle Personen, Dokumente und verschlüsselten Dateien auf diesem Gerät werden entfernt. Der gerätegebundene Master Key bleibt erhalten.',
                      [
                        { text: 'Abbrechen', style: 'cancel' },
                        {
                          text: 'Löschen',
                          style: 'destructive',
                          onPress: () => {
                            void VaultCutoverService.secureWipeSenderVault()
                              .then(() => bootstrap())
                              .catch((e) => Alert.alert('Löschen', (e as Error).message));
                          },
                        },
                      ]
                    );
                  }}
                />
              </View>
            ) : null}

            {role === 'host' && cutover.phase !== 'awaiting_sender_choice' ? (
              <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Sender: wartet auf Cutover-Bestätigung vom Empfänger. Kein automatisches Löschen.
              </Text>
            ) : null}
          </Panel>
        </View>
      ) : null}
    </View>
  );
}

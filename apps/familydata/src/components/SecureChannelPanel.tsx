import { useRouter, type Href } from 'expo-router';
import { Alert, Text, View } from 'react-native';

import { TransferTimeline, type TimelineStep } from '@/components/TransferTimeline';
import { LoadingBlock, Panel, PrimaryButton, StatusBadge } from '@/components/ui';
import { DocumentTransferService } from '@/deviceTransfer/migration/DocumentTransferService';
import { MigrationTransferService } from '@/deviceTransfer/migration/MigrationTransferService';
import { VaultCutoverService } from '@/deviceTransfer/migration/VaultCutoverService';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';
import { friendlyTransferError } from '@/deviceTransfer/transferUiCopy';
import { useDocumentTransfer } from '@/deviceTransfer/useDocumentTransfer';
import { useMigrationTransfer } from '@/deviceTransfer/useMigrationTransfer';
import { useTransportSession } from '@/deviceTransfer/useTransportSession';
import { useVaultCutover } from '@/deviceTransfer/useVaultCutover';
import { useFamilyStore } from '@/store/familyStore';

function alertFriendly(title: string, error: unknown) {
  Alert.alert(title, friendlyTransferError(error));
}

function buildTimeline(args: {
  transportStatus: string;
  migrationPhase: string;
  docsPhase: string;
  cutoverPhase: string;
  docsProgress?: string;
  migrationProgress?: string;
  cutoverProgress?: string;
}): TimelineStep[] {
  const connectedDone = args.transportStatus === 'connected';
  const connectedActive = args.transportStatus === 'connecting';
  const connectedFailed = args.transportStatus === 'error';

  const familyDone =
    args.migrationPhase === 'committed' ||
    args.migrationPhase === 'validated';
  const familyActive =
    args.migrationPhase === 'sending' ||
    args.migrationPhase === 'receiving' ||
    args.migrationPhase === 'building' ||
    args.migrationPhase === 'prepared';
  const familyFailed = args.migrationPhase === 'failed';

  const docsDone = args.docsPhase === 'ready_for_4c';
  const docsActive = args.docsPhase === 'sending' || args.docsPhase === 'receiving';
  const docsFailed = args.docsPhase === 'failed';

  const setupDone =
    args.cutoverPhase === 'committed' || args.cutoverPhase === 'awaiting_sender_choice';
  const setupActive =
    args.cutoverPhase === 'building' ||
    args.cutoverPhase === 'prepared' ||
    args.cutoverPhase === 'validated';
  const setupFailed = args.cutoverPhase === 'failed';

  return [
    {
      id: 'connected',
      label: 'Geräte verbunden',
      status: connectedFailed ? 'failed' : connectedDone ? 'done' : connectedActive ? 'active' : 'pending',
      detail: connectedActive ? 'Verbindung wird aufgebaut…' : undefined,
    },
    {
      id: 'family',
      label: 'Familieninformationen',
      status: !connectedDone
        ? 'pending'
        : familyFailed
          ? 'failed'
          : familyDone
            ? 'done'
            : familyActive
              ? 'active'
              : 'pending',
      detail: familyActive ? args.migrationProgress || 'Übertragung läuft…' : undefined,
    },
    {
      id: 'docs',
      label: 'Dokumente',
      status: !familyDone
        ? 'pending'
        : docsFailed
          ? 'failed'
          : docsDone
            ? 'done'
            : docsActive
              ? 'active'
              : 'pending',
      detail: docsActive ? args.docsProgress || 'Übertragung läuft…' : undefined,
    },
    {
      id: 'setup',
      label: 'Einrichtung abgeschlossen',
      status: !docsDone
        ? 'pending'
        : setupFailed
          ? 'failed'
          : setupDone
            ? 'done'
            : setupActive
              ? 'active'
              : 'pending',
      detail: setupActive
        ? args.cutoverProgress || 'Neues Gerät wird eingerichtet…'
        : args.cutoverPhase === 'awaiting_sender_choice'
          ? 'Warte auf Entscheidung am alten Gerät…'
          : undefined,
    },
  ];
}

/**
 * Productive transfer progress UI after pairing + SAS confirmation.
 * No debug/test controls. Services unchanged.
 */
export function SecureChannelPanel({ paired }: { paired: boolean }) {
  const router = useRouter();
  const transport = useTransportSession();
  const migration = useMigrationTransfer();
  const docs = useDocumentTransfer();
  const cutover = useVaultCutover();
  const role = TransferSessionManager.getSnapshot().role;
  const bootstrap = useFamilyStore((s) => s.bootstrap);
  const transferId = migration.transferId;

  if (!paired) return null;

  const connected = transport.status === 'connected';
  const familyDone = migration.phase === 'committed' || migration.phase === 'validated';
  const docsDone = docs.phase === 'ready_for_4c';
  const cutoverDone = cutover.phase === 'committed';
  const awaitingSenderChoice = cutover.phase === 'awaiting_sender_choice';

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

  const timeline = buildTimeline({
    transportStatus: transport.status,
    migrationPhase: migration.phase,
    docsPhase: docs.phase,
    cutoverPhase: cutover.phase,
    docsProgress: docs.progress,
    migrationProgress: migration.progress,
    cutoverProgress: cutover.progress,
  });

  const displayError = friendlyTransferError(
    transport.error || migration.error || docs.error || cutover.error
  );

  const busy =
    transport.status === 'connecting' ||
    migration.phase === 'sending' ||
    migration.phase === 'receiving' ||
    docs.phase === 'sending' ||
    docs.phase === 'receiving' ||
    cutover.phase === 'building' ||
    cutover.phase === 'prepared' ||
    cutover.phase === 'validated';

  if (cutoverDone && role === 'joiner') {
    return (
      <View className="mt-4">
        <Panel className="px-4 py-4">
          <StatusBadge label="Erfolgreich" tone="ok" />
          <Text className="mt-3 font-display text-2xl text-ink dark:text-[#e7f2ec]">
            FamilyData ist bereit
          </Text>
          <Text className="mt-2 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
            Deine Daten sind auf diesem Gerät eingerichtet. Du kannst jetzt fortfahren.
          </Text>
          <View className="mt-4">
            <PrimaryButton
              label="Zur Familie"
              icon="people-outline"
              onPress={() => {
                void TransferSessionManager.clear().then(() => {
                  router.replace('/(tabs)' as Href);
                });
              }}
            />
          </View>
        </Panel>
        <View className="mt-4">
          <TransferTimeline steps={timeline} />
        </View>
      </View>
    );
  }

  if (awaitingSenderChoice && role === 'host') {
    return (
      <View className="mt-4">
        <Panel className="px-4 py-4">
          <StatusBadge label="Abgeschlossen" tone="ok" />
          <Text className="mt-3 font-display text-2xl text-ink dark:text-[#e7f2ec]">Fertig</Text>
          <Text className="mt-2 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
            Die Übertragung wurde abgeschlossen.
          </Text>
          <Text className="mt-2 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Entscheide, was mit den Daten auf diesem Gerät geschehen soll.
          </Text>
          <View className="mt-4 gap-2">
            <PrimaryButton
              label="Auf diesem Gerät behalten"
              icon="checkmark-outline"
              onPress={() => {
                VaultCutoverService.markSenderKept();
                Alert.alert('Fertig', 'Die Daten bleiben auf diesem Gerät.', [
                  {
                    text: 'OK',
                    onPress: () => {
                      void TransferSessionManager.clear().then(() =>
                        router.replace('/settings/transfer' as Href)
                      );
                    },
                  },
                ]);
              }}
            />
            <PrimaryButton
              label="Sicher löschen"
              tone="ghost"
              icon="trash-outline"
              onPress={() => {
                Alert.alert(
                  'Sicher löschen',
                  'Alle Familien- und Dokumentdaten auf diesem Gerät werden entfernt.',
                  [
                    { text: 'Abbrechen', style: 'cancel' },
                    {
                      text: 'Löschen',
                      style: 'destructive',
                      onPress: () => {
                        void VaultCutoverService.secureWipeSenderVault()
                          .then(() => bootstrap())
                          .then(() => TransferSessionManager.clear())
                          .then(() => router.replace('/settings/transfer' as Href))
                          .catch((e) => alertFriendly('Löschen', e));
                      },
                    },
                  ]
                );
              }}
            />
          </View>
        </Panel>
        <View className="mt-4">
          <TransferTimeline steps={timeline} />
        </View>
      </View>
    );
  }

  return (
    <View className="mt-4">
      <TransferTimeline steps={timeline} />

      <Panel className="mt-4 px-4 py-4">
        {displayError ? (
          <Text className="mb-3 font-sans text-sm text-danger">{displayError}</Text>
        ) : null}

        {busy ? (
          <View className="mb-3 py-2">
            <LoadingBlock
              label={
                transport.status === 'connecting'
                  ? 'Verbindung wird hergestellt…'
                  : cutover.phase === 'building' ||
                      cutover.phase === 'prepared' ||
                      cutover.phase === 'validated'
                    ? 'Neues Gerät wird eingerichtet…'
                    : docs.phase === 'sending' || docs.phase === 'receiving'
                      ? 'Dokumente werden übertragen…'
                      : 'Familiendaten werden übertragen…'
              }
            />
          </View>
        ) : null}

        <View className="gap-2">
          {!connected && transport.status !== 'connecting' ? (
            <PrimaryButton
              label={role === 'host' ? 'Verbindung herstellen' : 'Auf Verbindung warten'}
              icon="link-outline"
              onPress={() => {
                const params = TransferSessionManager.getTransportConnectParams();
                if (!params) {
                  Alert.alert(
                    'Verbindung',
                    'Bitte vergleiche zuerst den Sicherheitscode auf beiden Geräten.'
                  );
                  return;
                }
                void TransportManager.connect(params).catch((e) => alertFriendly('Verbindung', e));
              }}
            />
          ) : null}

          {connected && role === 'host' && !familyDone ? (
            <PrimaryButton
              label="Familiendaten senden"
              icon="cloud-upload-outline"
              disabled={migration.phase === 'sending'}
              onPress={() => {
                void MigrationTransferService.sendMetadataTransfer().catch((e) =>
                  alertFriendly('Übertragung', e)
                );
              }}
            />
          ) : null}

          {connected && role === 'joiner' && !familyDone ? (
            <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Warte auf Daten
            </Text>
          ) : null}

          {connected && role === 'host' && familyDone && !docsDone ? (
            <PrimaryButton
              label="Dokumente senden"
              icon="document-outline"
              disabled={docs.phase === 'sending'}
              onPress={() => {
                void DocumentTransferService.sendAllEncryptedDocuments().catch((e) =>
                  alertFriendly('Übertragung', e)
                );
              }}
            />
          ) : null}

          {connected && role === 'joiner' && familyDone && !docsDone ? (
            <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Dokumente werden übertragen
            </Text>
          ) : null}

          {connected && role === 'joiner' && docsDone && !cutoverDone ? (
            <PrimaryButton
              label="Einrichtung starten"
              icon="shield-checkmark-outline"
              disabled={!canRunCutover}
              onPress={() => {
                if (!transferId) return;
                Alert.alert(
                  'Einrichtung',
                  'FamilyData wird auf diesem Gerät eingerichtet. Bestehende Empfänger-Daten werden ersetzt.',
                  [
                    { text: 'Abbrechen', style: 'cancel' },
                    {
                      text: 'Starten',
                      onPress: () => {
                        void VaultCutoverService.runCutover(transferId)
                          .then(() => bootstrap())
                          .catch((e) => alertFriendly('Einrichtung', e));
                      },
                    },
                  ]
                );
              }}
            />
          ) : null}

          {connected && role === 'host' && docsDone && !awaitingSenderChoice && !cutoverDone ? (
            <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Neues Gerät wird eingerichtet
            </Text>
          ) : null}
        </View>
      </Panel>
    </View>
  );
}

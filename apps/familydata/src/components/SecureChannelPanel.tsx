import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Alert, Text, View } from 'react-native';

import { TransferActionHint } from '@/components/TransferActionHint';
import { TransferTimeline, type TimelineStep } from '@/components/TransferTimeline';
import { LoadingBlock, Panel, PrimaryButton, StatusBadge } from '@/components/ui';
import { VaultCutoverService } from '@/deviceTransfer/migration/VaultCutoverService';
import { TransferSessionManager } from '@/deviceTransfer/TransferSessionManager';
import { resolveTransferActionHint } from '@/deviceTransfer/transferUiActions';
import {
  formatDocumentTransferDetail,
  friendlyProgressLine,
  friendlyTransferError,
  KEEP_APP_OPEN_HINT,
} from '@/deviceTransfer/transferUiCopy';
import {
  resetTransferSession,
  useProductionTransferFlow,
} from '@/deviceTransfer/useProductionTransferFlow';
import { useFamilyStore } from '@/store/familyStore';

const HARD_FAIL_CLEAR_MS = 350;
const HARD_FAIL_NAV_MS = 1400;

function alertFriendly(title: string, error: unknown) {
  Alert.alert(title, friendlyTransferError(error));
}

function TransferSummaryPanel({
  people,
  documents,
}: {
  people: number;
  documents: number;
}) {
  return (
    <Panel className="mb-4 px-4 py-4">
      <Text
        className="font-sansBold text-base text-ink dark:text-[#e7f2ec]"
        accessibilityRole="header"
      >
        Übertragung abgeschlossen
      </Text>
      <View className="mt-3 gap-2">
        <Text className="font-sans text-[14px] leading-5 text-ink dark:text-[#e7f2ec]">
          ✓ Familieninformationen
        </Text>
        <Text className="font-sans text-[14px] leading-5 text-ink dark:text-[#e7f2ec]">
          ✓ Dokumente
        </Text>
        <Text className="font-sans text-[14px] leading-5 text-ink dark:text-[#e7f2ec]">
          ✓ Einstellungen
        </Text>
      </View>
      {documents > 0 ? (
        <Text className="mt-3 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
          {documents === 1
            ? '1 Dokument erfolgreich übernommen'
            : `${documents} Dokumente erfolgreich übernommen`}
        </Text>
      ) : null}
      {people > 0 ? (
        <Text className="mt-1 font-sans text-[14px] leading-5 text-mute dark:text-[#9bb0a6]">
          {people === 1 ? '1 Person übernommen' : `${people} Personen übernommen`}
        </Text>
      ) : null}
    </Panel>
  );
}

function buildTimeline(args: {
  transportStatus: string;
  migrationPhase: string;
  docsPhase: string;
  cutoverPhase: string;
  docsDetail?: string;
  familyDetail?: string;
  cutoverDetail?: string;
}): TimelineStep[] {
  const connectedDone = args.transportStatus === 'connected';
  const connectedActive = args.transportStatus === 'connecting';
  const connectedFailed = args.transportStatus === 'error';

  const familyDone =
    args.migrationPhase === 'committed' || args.migrationPhase === 'validated';
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
      status: connectedFailed
        ? 'failed'
        : connectedDone
          ? 'done'
          : connectedActive
            ? 'active'
            : 'pending',
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
      detail: familyActive ? args.familyDetail : undefined,
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
      detail: docsActive ? args.docsDetail : undefined,
    },
    {
      id: 'setup',
      label: 'Einrichtung',
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
        ? args.cutoverDetail
        : args.cutoverPhase === 'awaiting_sender_choice'
          ? 'Warte auf Entscheidung am alten Gerät…'
          : undefined,
    },
  ];
}

/**
 * Productive transfer progress UI after pairing + SAS confirmation.
 * Snapshots come from live Transfer services; host auto-advances connect→meta→docs.
 */
export function SecureChannelPanel({ paired }: { paired: boolean }) {
  const router = useRouter();
  const bootstrap = useFamilyStore((s) => s.bootstrap);
  const flow = useProductionTransferFlow(paired);
  const hardFailHandled = useRef(false);
  const hardFailRecovering = useRef(false);
  const [senderActionBusy, setSenderActionBusy] = useState(false);
  const [cutoverBusy, setCutoverBusy] = useState(false);

  const {
    role,
    transport,
    migration,
    docs,
    cutover,
    displayError,
    hasHardFailure,
    joinWaitingForPeer,
  } = flow;

  // E1: hard failures → show error, clear session, return to hub (no half-open session).
  // User abort / SAS mismatch stay outside this panel and do not use this path.
  // Once recovery starts, clear()+navigate must not be cancelled by paired→false unmount.
  useEffect(() => {
    if (!hasHardFailure || !displayError) {
      if (!hasHardFailure && !hardFailRecovering.current) {
        hardFailHandled.current = false;
      }
      return;
    }
    if (!paired && !hardFailRecovering.current) return;
    if (hardFailHandled.current) return;
    hardFailHandled.current = true;
    hardFailRecovering.current = true;

    void (async () => {
      await new Promise<void>((r) => setTimeout(r, HARD_FAIL_CLEAR_MS));
      try {
        await resetTransferSession();
      } catch {
        /* best-effort */
      }
      await new Promise<void>((r) => setTimeout(r, HARD_FAIL_NAV_MS));
      hardFailRecovering.current = false;
      router.replace('/settings/transfer' as Href);
    })();
  }, [paired, hasHardFailure, displayError, router]);

  if (!paired) return null;

  const transferId = migration.transferId;

  const connected = transport.status === 'connected';
  const familyDone = migration.phase === 'committed' || migration.phase === 'validated';
  const docsDone = docs.phase === 'ready_for_4c';
  const docsActive = docs.phase === 'sending' || docs.phase === 'receiving';
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

  const docsDetail = formatDocumentTransferDetail({
    phase: docs.phase,
    progress: docs.progress,
    sentCount: docs.sentCount,
    receivedCount: docs.receivedCount,
    expectedTotal: migration.documentCount,
  });

  const timeline = buildTimeline({
    transportStatus: transport.status,
    migrationPhase: migration.phase,
    docsPhase: docs.phase,
    cutoverPhase: cutover.phase,
    docsDetail,
    familyDetail: friendlyProgressLine(
      migration.progress,
      'Familieninformationen werden übertragen…'
    ),
    cutoverDetail: friendlyProgressLine(cutover.progress, 'Neues Gerät wird eingerichtet…'),
  });

  const actionHint = resolveTransferActionHint({
    role,
    transportStatus: transport.status,
    migrationPhase: migration.phase,
    docsPhase: docs.phase,
    cutoverPhase: cutover.phase,
    joinWaitingForPeer,
  });

  const busy =
    transport.status === 'connecting' ||
    migration.phase === 'sending' ||
    migration.phase === 'receiving' ||
    docs.phase === 'sending' ||
    docs.phase === 'receiving' ||
    cutover.phase === 'building' ||
    cutover.phase === 'prepared' ||
    cutover.phase === 'validated';

  const summaryPeople = cutover.people > 0 ? cutover.people : migration.peopleCount ?? 0;
  const summaryDocuments =
    cutover.documents > 0
      ? cutover.documents
      : migration.documentCount ?? docs.receivedCount ?? 0;

  if (cutoverDone && role === 'joiner') {
    return (
      <View className="mt-4">
        <TransferSummaryPanel people={summaryPeople} documents={summaryDocuments} />
        <Panel className="px-4 py-4">
          <StatusBadge label="Erfolgreich" tone="ok" />
          <Text
            className="mt-3 font-display text-2xl text-ink dark:text-[#e7f2ec]"
            accessibilityRole="header"
          >
            Deine Daten sind bereit
          </Text>
          <Text className="mt-2 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
            Die Übertragung wurde erfolgreich abgeschlossen.
          </Text>
          <View className="mt-4">
            <PrimaryButton
              label="Zu FamilyData"
              icon="people-outline"
              accessibilityLabel="Zu FamilyData wechseln"
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
          <StatusBadge label="Erfolgreich" tone="ok" />
          <Text
            className="mt-3 font-display text-2xl text-ink dark:text-[#e7f2ec]"
            accessibilityRole="header"
          >
            Übertragung erfolgreich
          </Text>
          <Text className="mt-2 font-sans text-[15px] leading-5 text-mute dark:text-[#9bb0a6]">
            Das neue Gerät wurde eingerichtet.
          </Text>
          <Text className="mt-2 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
            Entscheide, was mit den Daten auf diesem Gerät geschehen soll.
          </Text>
          <View className="mt-4 gap-2">
            <PrimaryButton
              label="Auf diesem Gerät behalten"
              icon="checkmark-outline"
              accessibilityLabel="Daten auf diesem Gerät behalten"
              disabled={senderActionBusy}
              onPress={() => {
                if (senderActionBusy) return;
                setSenderActionBusy(true);
                VaultCutoverService.markSenderKept();
                Alert.alert('Fertig', 'Die Daten bleiben auf diesem Gerät.', [
                  {
                    text: 'OK',
                    onPress: () => {
                      void TransferSessionManager.clear()
                        .then(() => router.replace('/settings/transfer' as Href))
                        .finally(() => setSenderActionBusy(false));
                    },
                  },
                ]);
              }}
            />
            <PrimaryButton
              label="Sicher löschen"
              tone="ghost"
              icon="trash-outline"
              accessibilityLabel="Daten auf diesem Gerät sicher löschen"
              disabled={senderActionBusy}
              onPress={() => {
                if (senderActionBusy) return;
                Alert.alert(
                  'Daten auf diesem Gerät löschen?',
                  'Alle gespeicherten Familieninformationen und Dokumente werden von diesem Gerät entfernt. Dies kann nicht rückgängig gemacht werden.',
                  [
                    { text: 'Behalten', style: 'cancel' },
                    {
                      text: 'Sicher löschen',
                      style: 'destructive',
                      onPress: () => {
                        setSenderActionBusy(true);
                        void VaultCutoverService.secureWipeSenderVault()
                          .then(() => bootstrap())
                          .then(() => TransferSessionManager.clear())
                          .then(() => router.replace('/settings/transfer' as Href))
                          .catch((e) => {
                            setSenderActionBusy(false);
                            alertFriendly('Löschen', e);
                          });
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
      <TransferActionHint hint={actionHint} />

      {docsActive ? (
        <Text
          className="mt-3 font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]"
          accessibilityRole="text"
        >
          {KEEP_APP_OPEN_HINT}
        </Text>
      ) : null}

      <Panel className="mt-4 px-4 py-4">
        {hasHardFailure ? (
          <View className="mb-3 gap-3">
            <StatusBadge label="Fehler" tone="danger" />
            {displayError ? (
              <Text className="font-sans text-sm text-danger" accessibilityRole="alert">
                {displayError}
              </Text>
            ) : null}
            <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
              Die Übertragung wird beendet. Du wirst zurückgeleitet…
            </Text>
          </View>
        ) : null}

        {busy && !hasHardFailure ? (
          <View className="mb-3 py-2" accessibilityLabel="Übertragung läuft">
            <LoadingBlock
              label={
                transport.status === 'connecting'
                  ? 'Verbindung wird hergestellt…'
                  : cutover.phase === 'building' ||
                      cutover.phase === 'prepared' ||
                      cutover.phase === 'validated'
                    ? 'Neues Gerät wird eingerichtet…'
                    : docsActive
                      ? 'Dokumente werden übertragen…'
                      : 'Familiendaten werden übertragen…'
              }
            />
          </View>
        ) : null}

        {!hasHardFailure ? (
          <View className="gap-2">
            {!connected && transport.status === 'connecting' ? (
              <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Sichere Verbindung wird aufgebaut…
              </Text>
            ) : null}

            {connected && role === 'joiner' && !familyDone ? (
              <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                Warte auf Daten
              </Text>
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
                disabled={!canRunCutover || cutoverBusy}
                onPress={() => {
                  if (!transferId || cutoverBusy || !canRunCutover) return;
                  Alert.alert(
                    'Einrichtung',
                    'FamilyData wird auf diesem Gerät eingerichtet. Bestehende Daten auf diesem Gerät werden ersetzt.',
                    [
                      { text: 'Abbrechen', style: 'cancel' },
                      {
                        text: 'Starten',
                        onPress: () => {
                          setCutoverBusy(true);
                          void VaultCutoverService.runCutover(transferId)
                            .then(() => bootstrap())
                            .catch((e) => {
                              setCutoverBusy(false);
                              alertFriendly('Einrichtung', e);
                            });
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

            {connected && role === 'host' && !docsDone ? (
              <Text className="font-sans text-[13px] leading-5 text-mute dark:text-[#9bb0a6]">
                {familyDone
                  ? 'Dokumente werden gesendet…'
                  : 'Familiendaten werden gesendet…'}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Panel>
    </View>
  );
}

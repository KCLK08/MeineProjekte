/**
 * UI-only helpers for device-transfer screens.
 * Reads existing service snapshots; does not change transfer/security logic.
 */

import { Alert } from 'react-native';

import { DocumentTransferService } from '@/deviceTransfer/migration/DocumentTransferService';
import { MigrationTransferService } from '@/deviceTransfer/migration/MigrationTransferService';
import { VaultCutoverService } from '@/deviceTransfer/migration/VaultCutoverService';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';

/** True when channel / metadata / docs / cutover is in progress (not idle pairing). */
export function isTransferProgressActive(): boolean {
  const transport = TransportManager.getSnapshot().status;
  if (transport === 'connected' || transport === 'connecting') return true;

  const migration = MigrationTransferService.getSnapshot().phase;
  if (migration !== 'idle' && migration !== 'failed') return true;

  const docs = DocumentTransferService.getSnapshot().phase;
  if (docs !== 'idle' && docs !== 'failed') return true;

  const cutover = VaultCutoverService.getSnapshot().phase;
  if (cutover !== 'idle' && cutover !== 'failed') return true;

  return false;
}

/** Confirm before aborting an active transfer; otherwise run immediately. */
export function requestAbortTransfer(onConfirm: () => void | Promise<void>) {
  if (!isTransferProgressActive()) {
    void Promise.resolve(onConfirm());
    return;
  }
  Alert.alert(
    'Übertragung abbrechen?',
    'Die aktuelle Übertragung wird beendet. Du kannst danach erneut starten.',
    [
      { text: 'Abbrechen', style: 'cancel' },
      {
        text: 'Übertragung beenden',
        style: 'destructive',
        onPress: () => {
          void Promise.resolve(onConfirm());
        },
      },
    ]
  );
}

export function resolveTransferActionHint(args: {
  role: 'host' | 'joiner' | null;
  transportStatus: string;
  migrationPhase: string;
  docsPhase: string;
  cutoverPhase: string;
}): string | null {
  const { role, transportStatus, migrationPhase, docsPhase, cutoverPhase } = args;
  if (!role) return null;

  const connected = transportStatus === 'connected';
  const connecting = transportStatus === 'connecting';
  const familyDone = migrationPhase === 'committed' || migrationPhase === 'validated';
  const familyBusy =
    migrationPhase === 'sending' ||
    migrationPhase === 'receiving' ||
    migrationPhase === 'building' ||
    migrationPhase === 'prepared';
  const docsDone = docsPhase === 'ready_for_4c';
  const docsBusy = docsPhase === 'sending' || docsPhase === 'receiving';
  const cutoverDone = cutoverPhase === 'committed' || cutoverPhase === 'awaiting_sender_choice';
  const cutoverBusy =
    cutoverPhase === 'building' || cutoverPhase === 'prepared' || cutoverPhase === 'validated';

  if (role === 'host') {
    if (!connected && !connecting) return 'Als Nächstes: Verbindung herstellen';
    if (connecting) return 'Warte: Verbindung wird aufgebaut…';
    if (!familyDone) {
      return familyBusy
        ? 'Warte: Familiendaten werden gesendet…'
        : 'Als Nächstes: Familiendaten senden';
    }
    if (!docsDone) {
      return docsBusy ? 'Warte: Dokumente werden gesendet…' : 'Als Nächstes: Dokumente senden';
    }
    if (!cutoverDone) {
      return 'Warte: Das neue Gerät richtet die Daten ein.';
    }
    return null;
  }

  // joiner
  if (!connected && !connecting) return 'Als Nächstes: Mit altem Gerät verbinden';
  if (connecting) return 'Warte: Verbindung wird aufgebaut…';
  if (!familyDone) {
    return familyBusy
      ? 'Warte: Das alte Gerät sendet die Daten.'
      : 'Warte: Das alte Gerät sendet die Daten.';
  }
  if (!docsDone) {
    return docsBusy
      ? 'Warte: Das alte Gerät sendet die Dokumente.'
      : 'Warte: Das alte Gerät sendet die Daten.';
  }
  if (!cutoverDone) {
    return cutoverBusy
      ? 'Warte: Einrichtung läuft…'
      : 'Als Nächstes: Einrichtung starten';
  }
  return null;
}

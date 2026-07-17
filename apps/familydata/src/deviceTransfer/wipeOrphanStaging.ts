import { StagingStore } from '@/deviceTransfer/migration/StagingStore';

/**
 * Cold-start hygiene: wipe orphaned transfer staging left by crash / force-stop.
 * Safe because transfer sessions are RAM-only and never resume across process death.
 */
export async function wipeOrphanTransferStaging(): Promise<void> {
  try {
    await StagingStore.wipeAll();
  } catch {
    /* best-effort */
  }
}

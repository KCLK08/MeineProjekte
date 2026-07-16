import * as SecureStore from 'expo-secure-store';

import { createId, nowIso } from '@/utils/helpers';

/**
 * Local security event log.
 * While the vault is unlocked, events are stored in the SQLCipher DB.
 * While locked (e.g. failed auth), a capped queue lives in SecureStore (OS-encrypted, no content).
 */

export type SecurityEventType =
  | 'vault_unlocked'
  | 'vault_locked'
  | 'auth_failed'
  | 'encryption_enabled'
  | 'encryption_disable_blocked'
  | 'export_performed';

export type SecurityEvent = {
  id: string;
  at: string;
  type: SecurityEventType;
};

const PENDING_KEY = 'familydata.security.events.pending';
const MAX_PENDING = 40;
const MAX_DB = 200;

const storeOpts: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

const LABELS: Record<SecurityEventType, string> = {
  vault_unlocked: 'Vault unlocked',
  vault_locked: 'Vault locked',
  auth_failed: 'Authentication failed',
  encryption_enabled: 'Encryption enabled',
  encryption_disable_blocked: 'Encryption disable blocked',
  export_performed: 'Export performed',
};

async function readPending(): Promise<SecurityEvent[]> {
  try {
    const raw = await SecureStore.getItemAsync(PENDING_KEY, storeOpts);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SecurityEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writePending(events: SecurityEvent[]) {
  await SecureStore.setItemAsync(PENDING_KEY, JSON.stringify(events.slice(-MAX_PENDING)), storeOpts);
}

export const SecurityEventLog = {
  label(type: SecurityEventType): string {
    return LABELS[type];
  },

  formatDisplay(event: SecurityEvent): string {
    const d = new Date(event.at);
    const stamp = Number.isNaN(d.getTime())
      ? event.at
      : d.toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
    return `${stamp}\n${LABELS[event.type]}`;
  },

  async record(type: SecurityEventType): Promise<void> {
    const event: SecurityEvent = { id: createId('sev'), at: nowIso(), type };
    try {
      const { SecurityManager } = await import('@/security/SecurityManager');
      if (SecurityManager.isUnlocked()) {
        const repo = await import('@/db/repository');
        await repo.appendSecurityEvent(event);
        return;
      }
    } catch {
      // fall through to pending queue
    }
    const pending = await readPending();
    pending.push(event);
    await writePending(pending);
  },

  /** Flush SecureStore queue into the vault DB after unlock. */
  async flushPendingToVault(): Promise<void> {
    const pending = await readPending();
    if (!pending.length) return;
    const repo = await import('@/db/repository');
    for (const event of pending) {
      await repo.appendSecurityEvent(event);
    }
    await SecureStore.deleteItemAsync(PENDING_KEY).catch(() => undefined);
    await repo.trimSecurityEvents(MAX_DB);
  },

  async listRecent(limit = 20): Promise<SecurityEvent[]> {
    try {
      const { SecurityManager } = await import('@/security/SecurityManager');
      if (SecurityManager.isUnlocked()) {
        await this.flushPendingToVault();
        const repo = await import('@/db/repository');
        const rows = await repo.listSecurityEvents(limit);
        return rows.map((row) => ({
          id: row.id,
          at: row.at,
          type: row.type as SecurityEventType,
        }));
      }
    } catch {
      // locked
    }
    const pending = await readPending();
    return pending.slice(-limit).reverse();
  },
};

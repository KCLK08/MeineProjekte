import * as Crypto from 'expo-crypto';
import * as FileSystem from 'expo-file-system/legacy';

import { wipeBytes } from '@/deviceTransfer/bytes';
import { DocumentFileTransferIO } from '@/deviceTransfer/migration/DocumentFileTransferIO';
import { DocumentTransferWrap } from '@/deviceTransfer/migration/DocumentTransferWrap';
import { MigrationManifestService } from '@/deviceTransfer/migration/MigrationManifest';
import { MigrationTransaction } from '@/deviceTransfer/migration/MigrationTransaction';
import { StagingStore } from '@/deviceTransfer/migration/StagingStore';
import type { VaultMetadataPayload } from '@/deviceTransfer/migration/types';
import { VaultMetadataApplyService } from '@/deviceTransfer/migration/VaultMetadataApplyService';
import { TransportManager } from '@/deviceTransfer/transport/TransportManager';
import {
  closeDatabase,
  configureDatabaseEncryption,
  databaseFileExists,
  deleteDatabaseFile,
  ensureDatabaseReady,
  MIGRATION_VAULT_DB_NAME,
  resolveDatabaseFilePath,
  VAULT_DB_NAME,
  withEncryptedDatabase,
} from '@/db/repository';
import { DocumentEncryptionService } from '@/security/DocumentEncryptionService';
import { KeyStoreService } from '@/security/KeyStoreService';
import { SecurityManager } from '@/security/SecurityManager';
import { withAutoLockSuppressed } from '@/security/autoLockSuppress';

const ENCRYPTED_DIR = 'familydata-encrypted';
const MIGRATION_ENCRYPTED_DIR = 'familydata-encrypted-migration';
const BAK_ENCRYPTED_DIR = 'familydata-encrypted.pre-cutover';

export type VaultCutoverSnapshot = {
  phase:
    | 'idle'
    | 'prepared'
    | 'building'
    | 'validated'
    | 'committed'
    | 'failed'
    | 'awaiting_sender_choice';
  progress: string;
  transferId: string | null;
  error: string | null;
  people: number;
  documents: number;
  files: number;
  updatedAt: number;
};

type Listener = (snap: VaultCutoverSnapshot) => void;

function rootDir(): string {
  const base = FileSystem.documentDirectory;
  if (!base) throw new Error('Kein documentDirectory verfügbar.');
  return base;
}

function encryptedDirUri(name: string): string {
  return `${rootDir()}${name}/`;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function extFromSourceRelative(path: string): string {
  const match = path.match(/\.([a-z0-9]+)\.dat$/i);
  return match ? match[1]!.toLowerCase() : 'bin';
}

async function ensureDir(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(uri, { intermediates: true });
  }
}

async function wipeDir(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  if (info.exists) {
    await FileSystem.deleteAsync(uri, { idempotent: true });
  }
}

/**
 * Phase 4C: build a brand-new vault from validated staging, then atomically cut over.
 *
 * Master key: generated in RAM → Keystore only on commit.
 * Documents: transfer-wrap ciphertext → new-master ciphertext (no persistent plaintext).
 * Old master key is never imported or transmitted.
 */
class VaultCutoverServiceImpl {
  private phase: VaultCutoverSnapshot['phase'] = 'idle';
  private progress = '';
  private transferId: string | null = null;
  private error: string | null = null;
  private people = 0;
  private documents = 0;
  private files = 0;
  private updatedAt = Date.now();
  private listeners = new Set<Listener>();
  private cached: VaultCutoverSnapshot;
  private handlerAttached = false;
  private running = false;

  constructor() {
    this.cached = this.build();
  }

  subscribe(listener: Listener): () => void {
    this.ensureHandler();
    this.listeners.add(listener);
    listener(this.cached);
    return () => this.listeners.delete(listener);
  }

  getSnapshot(): VaultCutoverSnapshot {
    return this.cached;
  }

  reset() {
    this.phase = 'idle';
    this.progress = '';
    this.transferId = null;
    this.error = null;
    this.people = 0;
    this.documents = 0;
    this.files = 0;
    this.emit();
  }

  /**
   * Receiver: run full cutover for a staging transfer that completed 4A+4B.
   */
  async runCutover(transferId: string): Promise<void> {
    if (this.running) throw new Error('Cutover läuft bereits.');
    return withAutoLockSuppressed(() => this.runCutoverInternal(transferId));
  }

  private async runCutoverInternal(transferId: string): Promise<void> {
    this.running = true;
    this.transferId = transferId;
    this.error = null;
    let newMaster: Uint8Array | null = null;
    let docWrapKey: Uint8Array | null = null;

    try {
      if (!SecurityManager.isUnlocked()) {
        throw new Error('Tresor muss entsperrt sein (Empfänger-Session).');
      }
      if (TransportManager.getSnapshot().status !== 'connected') {
        throw new Error('Sicherer Kanal muss verbunden bleiben (Doc-Wrap-Key).');
      }

      // —— prepared ——
      this.phase = 'prepared';
      this.progress = 'Staging prüfen…';
      this.emit();

      const staging = await StagingStore.readRecord(transferId);
      if (staging.status !== 'committed') {
        throw new Error('Metadaten-Staging muss committed sein (Phase 4A).');
      }
      const payloadJson = await StagingStore.readPayload(transferId);
      const payload = JSON.parse(payloadJson) as VaultMetadataPayload;
      MigrationManifestService.parsePayload(payload);

      const mapping = await StagingStore.readMapping(transferId);
      const validatedDocs = mapping.documents.filter((d) => d.status === 'validated');
      const docsWithFiles = payload.documents.filter((d) => d.fileRef != null);
      if (validatedDocs.length !== docsWithFiles.length) {
        throw new Error(
          `Dokument-Mapping unvollständig (${validatedDocs.length}/${docsWithFiles.length}).`
        );
      }
      for (const entry of validatedDocs) {
        const path = StagingStore.finalPath(transferId, entry.localFileName);
        const info = await FileSystem.getInfoAsync(path);
        if (!info.exists) throw new Error(`Staging-Datei fehlt: ${entry.localFileName}`);
      }

      await MigrationTransaction.prepare(transferId, {
        expectedPeople: payload.people.length,
        expectedDocuments: payload.documents.length,
      });

      // —— building ——
      await MigrationTransaction.setStatus(transferId, 'building');
      this.phase = 'building';
      this.progress = 'Neuen Master Key erzeugen…';
      this.emit();

      newMaster = await KeyStoreService.generateMasterKeyBytes();
      const keyHex = KeyStoreService.toSqlCipherHex(newMaster);
      docWrapKey = TransportManager.borrowDocWrapKey();

      await wipeDir(encryptedDirUri(MIGRATION_ENCRYPTED_DIR));
      await ensureDir(encryptedDirUri(MIGRATION_ENCRYPTED_DIR));
      await deleteDatabaseFile(MIGRATION_VAULT_DB_NAME).catch(() => undefined);

      this.progress = 'Neue SQLCipher-Vault aufbauen…';
      this.emit();

      const applied = await withEncryptedDatabase(MIGRATION_VAULT_DB_NAME, keyHex, async (db) => {
        const counts = await VaultMetadataApplyService.apply(db, payload);

        let fileCount = 0;
        for (const entry of validatedDocs) {
          const src = StagingStore.finalPath(transferId, entry.localFileName);
          const wrapB64 = await FileSystem.readAsStringAsync(src, {
            encoding: FileSystem.EncodingType.Base64,
          });
          const wrapBytes = base64ToBytes(wrapB64);
          let vaultCipher: Uint8Array | null = null;
          try {
            const hash = DocumentFileTransferIO.hashBytes(wrapBytes);
            if (hash !== entry.sha256) {
              throw new Error(`Hash-Fehler vor Rekey: ${entry.documentId}`);
            }
            vaultCipher = await DocumentTransferWrap.rekeyToNewMaster(
              wrapBytes,
              docWrapKey!,
              newMaster!
            );
            const rand = await Crypto.getRandomBytesAsync(16);
            const name = Array.from(rand, (b) => b.toString(16).padStart(2, '0')).join('');
            const metaDoc = payload.documents.find((d) => d.id === entry.documentId);
            const ext = extFromSourceRelative(
              metaDoc?.fileRef?.relativePath || entry.sourceRelativePath
            );
            const dest = `${encryptedDirUri(MIGRATION_ENCRYPTED_DIR)}${name}.${ext}.dat`;
            await FileSystem.writeAsStringAsync(dest, bytesToBase64(vaultCipher), {
              encoding: FileSystem.EncodingType.Base64,
            });
            await VaultMetadataApplyService.updateDocumentPath(db, entry.documentId, dest);
            fileCount += 1;
          } finally {
            wipeBytes(wrapBytes);
            wipeBytes(vaultCipher);
          }
        }

        // —— validated (still inside open DB) ——
        const peopleCount = await VaultMetadataApplyService.countPeople(db);
        const docCount = await VaultMetadataApplyService.countDocuments(db);
        if (peopleCount !== payload.people.length) {
          throw new Error(`Personen-Anzahl falsch (${peopleCount}/${payload.people.length}).`);
        }
        if (docCount !== payload.documents.length) {
          throw new Error(`Dokument-Anzahl falsch (${docCount}/${payload.documents.length}).`);
        }
        const paths = await VaultMetadataApplyService.listDocumentPaths(db);
        if (paths.length !== validatedDocs.length) {
          throw new Error(`Dateireferenzen unvollständig (${paths.length}/${validatedDocs.length}).`);
        }
        for (const row of paths) {
          if (!DocumentEncryptionService.isEncryptedPath(row.filePath)) {
            throw new Error(`Ungültiger Dokumentpfad nach Import: ${row.id}`);
          }
          const info = await FileSystem.getInfoAsync(row.filePath);
          if (!info.exists) throw new Error(`Finale Datei fehlt: ${row.id}`);
        }

        return { ...counts, fileCount, peopleCount, docCount };
      });

      this.people = applied.peopleCount;
      this.documents = applied.docCount;
      this.files = applied.fileCount;
      await MigrationTransaction.setStatus(transferId, 'validated', {
        appliedPeople: applied.peopleCount,
        appliedDocuments: applied.docCount,
        appliedFiles: applied.fileCount,
      });
      this.phase = 'validated';
      this.progress = 'Integrität OK – Cutover vorbereiten…';
      this.emit();

      // —— committed (atomic swap) ——
      await this.commitSwap(transferId, newMaster, keyHex);

      wipeBytes(newMaster);
      newMaster = null;
      wipeBytes(docWrapKey);
      docWrapKey = null;

      await StagingStore.rollback(transferId).catch(() => undefined);

      this.phase = 'committed';
      this.progress = 'Übertragung abgeschlossen – neuer Vault aktiv.';
      this.emit();

      try {
        await TransportManager.sendMessage(
          'cutover_complete',
          JSON.stringify({
            transferId,
            people: this.people,
            documents: this.documents,
            files: this.files,
          })
        );
      } catch {
        /* channel may already be closing */
      }
    } catch (e) {
      const msg = (e as Error).message || 'Cutover fehlgeschlagen';
      this.error = msg;
      this.phase = 'failed';
      this.progress = 'Rollback…';
      this.emit();
      await MigrationTransaction.fail(transferId, msg).catch(() => undefined);
      await this.rollbackArtifacts().catch(() => undefined);
      try {
        await TransportManager.sendMessage('cutover_reject', msg.slice(0, 200));
      } catch {
        /* ignore */
      }
      throw e;
    } finally {
      wipeBytes(newMaster);
      wipeBytes(docWrapKey);
      this.running = false;
      this.emit();
    }
  }

  /**
   * Sender: securely erase vault user data after successful transfer (optional).
   * Keeps device-bound master key and empty SQLCipher DB.
   */
  async secureWipeSenderVault(): Promise<void> {
    if (!SecurityManager.isUnlocked()) {
      throw new Error('Tresor muss entsperrt sein.');
    }
    this.progress = 'Sicheres Löschen…';
    this.emit();
    await SecurityManager.secureWipeVaultContents();
    this.phase = 'idle';
    this.progress = 'Sender-Vault geleert (Master Key bleibt gerätegebunden).';
    this.emit();
  }

  /** Sender chose to keep data after transfer. */
  markSenderKept() {
    this.phase = 'idle';
    this.progress = 'Daten auf diesem Gerät behalten.';
    this.error = null;
    this.emit();
  }

  private async commitSwap(transferId: string, newMaster: Uint8Array, keyHex: string) {
    this.progress = 'Atomic Cutover…';
    this.emit();

    const prodEnc = encryptedDirUri(ENCRYPTED_DIR);
    const migEnc = encryptedDirUri(MIGRATION_ENCRYPTED_DIR);
    const bakEnc = encryptedDirUri(BAK_ENCRYPTED_DIR);

    await closeDatabase();
    configureDatabaseEncryption(null);

    // Backup productive encrypted dir
    await wipeDir(bakEnc);
    const prodInfo = await FileSystem.getInfoAsync(prodEnc);
    if (prodInfo.exists) {
      await FileSystem.moveAsync({ from: prodEnc, to: bakEnc });
    }

    // Promote migration encrypted dir
    await FileSystem.moveAsync({ from: migEnc, to: prodEnc });

    // Swap DB files
    const migDbPath = await resolveDatabaseFilePath(MIGRATION_VAULT_DB_NAME);
    if (!migDbPath) throw new Error('Migrations-DB nicht gefunden.');

    const hadVault = await databaseFileExists(VAULT_DB_NAME);
    let bakDbPath: string | null = null;
    if (hadVault) {
      const vaultPath = await resolveDatabaseFilePath(VAULT_DB_NAME);
      if (vaultPath) {
        bakDbPath = `${vaultPath}.pre-cutover`;
        await FileSystem.deleteAsync(bakDbPath, { idempotent: true }).catch(() => undefined);
        await FileSystem.moveAsync({ from: vaultPath, to: bakDbPath });
      }
    }

    const vaultDest =
      (await resolveDatabaseFilePath(VAULT_DB_NAME)) ||
      `${rootDir()}SQLite/${VAULT_DB_NAME}`;
    await ensureDir(`${rootDir()}SQLite/`);
    await FileSystem.copyAsync({ from: migDbPath, to: vaultDest });
    await deleteDatabaseFile(MIGRATION_VAULT_DB_NAME).catch(() => undefined);

    try {
      // Prove new DB opens with new key before Keystore commit
      await withEncryptedDatabase(VAULT_DB_NAME, keyHex, async (db) => {
        const c = await VaultMetadataApplyService.countPeople(db);
        if (c !== this.people) throw new Error('Post-Swap Personen-Check fehlgeschlagen.');
      });

      await KeyStoreService.commitMasterKey(newMaster, 'Family Vault neuen Schlüssel schützen');
      await SecurityManager.adoptCommittedMasterKey(newMaster);
      await MigrationTransaction.setStatus(transferId, 'committed');

      // Cleanup backups
      await wipeDir(bakEnc);
      if (bakDbPath) {
        await FileSystem.deleteAsync(bakDbPath, { idempotent: true }).catch(() => undefined);
      }
    } catch (e) {
      // Restore previous vault artifacts; Keystore unchanged if commitMasterKey failed,
      // or re-open will use new key if commit succeeded but session failed.
      await wipeDir(prodEnc).catch(() => undefined);
      const bakInfo = await FileSystem.getInfoAsync(bakEnc);
      if (bakInfo.exists) {
        await FileSystem.moveAsync({ from: bakEnc, to: prodEnc }).catch(() => undefined);
      }
      if (bakDbPath) {
        const info = await FileSystem.getInfoAsync(bakDbPath);
        if (info.exists) {
          await deleteDatabaseFile(VAULT_DB_NAME).catch(() => undefined);
          await FileSystem.moveAsync({ from: bakDbPath, to: vaultDest }).catch(() => undefined);
        }
      }
      throw e;
    }
  }

  private async rollbackArtifacts() {
    await wipeDir(encryptedDirUri(MIGRATION_ENCRYPTED_DIR)).catch(() => undefined);
    await deleteDatabaseFile(MIGRATION_VAULT_DB_NAME).catch(() => undefined);
    // Restore session on previous master if still unlocked path broken
    try {
      if (SecurityManager.isUnlocked()) {
        const key = SecurityManager.borrowSessionKey();
        try {
          configureDatabaseEncryption(KeyStoreService.toSqlCipherHex(key));
          await closeDatabase();
          await ensureDatabaseReady();
        } finally {
          wipeBytes(key);
        }
      }
    } catch {
      /* leave locked; user can unlock again */
    }
  }

  private ensureHandler() {
    if (this.handlerAttached) return;
    this.handlerAttached = true;
    TransportManager.addMessageHandler((message) => {
      void this.onMessage(message.type, message.payload);
    });
  }

  private async onMessage(type: string, payload: string) {
    try {
      if (type === 'cutover_complete') {
        const data = JSON.parse(payload) as {
          transferId?: string;
          people?: number;
          documents?: number;
          files?: number;
        };
        this.transferId = data.transferId ?? this.transferId;
        this.people = data.people ?? this.people;
        this.documents = data.documents ?? this.documents;
        this.files = data.files ?? this.files;
        this.phase = 'awaiting_sender_choice';
        this.progress =
          'Übertragung abgeschlossen. Möchten Sie die Daten auf diesem Gerät behalten oder entfernen?';
        this.error = null;
        this.emit();
        try {
          await TransportManager.sendMessage(
            'cutover_ack',
            JSON.stringify({ transferId: this.transferId, stage: 'sender_notified' })
          );
        } catch {
          /* ignore */
        }
        return;
      }
      if (type === 'cutover_ack') {
        this.progress = 'Sender hat Cutover bestätigt.';
        this.emit();
        return;
      }
      if (type === 'cutover_reject') {
        this.phase = 'failed';
        this.error = payload || 'Cutover abgelehnt';
        this.progress = 'Gegenstelle: Cutover fehlgeschlagen';
        this.emit();
      }
    } catch (e) {
      this.phase = 'failed';
      this.error = (e as Error).message;
      this.emit();
    }
  }

  private build(): VaultCutoverSnapshot {
    return {
      phase: this.phase,
      progress: this.progress,
      transferId: this.transferId,
      error: this.error,
      people: this.people,
      documents: this.documents,
      files: this.files,
      updatedAt: this.updatedAt,
    };
  }

  private emit() {
    this.updatedAt = Date.now();
    this.cached = this.build();
    for (const l of this.listeners) l(this.cached);
  }
}

export const VaultCutoverService = new VaultCutoverServiceImpl();

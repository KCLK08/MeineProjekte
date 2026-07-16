import Constants from 'expo-constants';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { DocumentEncryptionService } from '@/security/DocumentEncryptionService';
import { isScreenCaptureProtected } from '@/security/runtimeHardening';
import { SecurityManager } from '@/security/SecurityManager';
import { readAutoLock } from '@/security/settingsFlags';

export type SecurityCheckId =
  | 'encryption_active'
  | 'sqlcipher_active'
  | 'master_key_present'
  | 'key_binding_active'
  | 'biometric_available'
  | 'auto_lock_active'
  | 'screenshot_protection'
  | 'backup_protection'
  | 'no_plaintext_documents'
  | 'offline_mode';

export type SecurityCheckResult = {
  id: SecurityCheckId;
  label: string;
  ok: boolean;
  detail: string;
};

export type SecurityCheckReport = {
  checks: SecurityCheckResult[];
  passed: number;
  total: number;
  score: number;
  status: 'Sehr gut' | 'Hinweise vorhanden';
  recommendations: string[];
  ranAt: string;
};

const CHECK_LABELS: Record<SecurityCheckId, string> = {
  encryption_active: 'Verschlüsselung aktiv',
  sqlcipher_active: 'SQLCipher Datenbank aktiv',
  master_key_present: 'Master Key vorhanden',
  key_binding_active: 'Key Binding aktiv',
  biometric_available: 'Biometrie / Gerätecode verfügbar',
  auto_lock_active: 'Auto-Lock aktiv',
  screenshot_protection: 'Screenshot-Schutz aktiv',
  backup_protection: 'Backup-Schutz aktiv',
  no_plaintext_documents: 'Keine Klartext-Dokumente gefunden',
  offline_mode: 'Offline-Modus aktiv',
};

async function countPlaintextAttachments(): Promise<number> {
  let count = 0;
  try {
    if (SecurityManager.isUnlocked()) {
      const repo = await import('@/db/repository');
      const docs = await repo.listDocuments();
      for (const doc of docs) {
        if (doc.filePath?.trim() && !DocumentEncryptionService.isEncryptedPath(doc.filePath)) {
          count += 1;
        }
      }
    }
  } catch {
    // vault locked or unavailable – skip DB scan
  }

  const root = FileSystem.documentDirectory;
  if (!root) return count;
  const staging = `${root}familydata-files/`;
  try {
    const info = await FileSystem.getInfoAsync(staging);
    if (info.exists && info.isDirectory) {
      const names = await FileSystem.readDirectoryAsync(staging);
      count += names.filter((n) => !n.startsWith('.')).length;
    }
  } catch {
    // ignore
  }
  return count;
}

async function offlinePdfBundled(): Promise<boolean> {
  try {
    const { loadLocalPdfJs } = await import('@/utils/pdfPreview');
    const { pdfJs, workerJs } = await loadLocalPdfJs();
    return Boolean(pdfJs?.length && workerJs?.length);
  } catch {
    return false;
  }
}

function backupProtectionConfigured(): boolean {
  const android = Constants.expoConfig?.android as { allowBackup?: boolean } | undefined;
  if (Platform.OS === 'android') {
    return android?.allowBackup === false;
  }
  // iOS: file sharing disabled in infoPlist
  const plist = Constants.expoConfig?.ios?.infoPlist as
    | { UIFileSharingEnabled?: boolean; LSSupportsOpeningDocumentsInPlace?: boolean }
    | undefined;
  return plist?.UIFileSharingEnabled === false || plist?.LSSupportsOpeningDocumentsInPlace === false;
}

/**
 * Local-only security self-test. No network, no data leaves the device.
 */
export const SecurityAuditService = {
  async runSecurityCheck(): Promise<SecurityCheckReport> {
    const vault = await SecurityManager.getVaultStatus();
    const bio = await SecurityManager.checkBiometricAvailability();
    const autoLock = await readAutoLock();
    const plaintextCount = await countPlaintextAttachments();
    const pdfOffline = await offlinePdfBundled();
    const encryptionActive = vault.hasVaultDb && vault.hasMasterKey && vault.sqlCipherSupported;
    const backupOk = backupProtectionConfigured();
    const screenshotOk = isScreenCaptureProtected() || Platform.OS === 'web';

    const checks: SecurityCheckResult[] = [
      {
        id: 'encryption_active',
        label: CHECK_LABELS.encryption_active,
        ok: encryptionActive,
        detail: encryptionActive ? 'Vault-Modus aktiv' : 'Vault noch nicht vollständig eingerichtet',
      },
      {
        id: 'sqlcipher_active',
        label: CHECK_LABELS.sqlcipher_active,
        ok: vault.sqlCipherSupported && vault.hasVaultDb,
        detail: vault.sqlCipherSupported
          ? vault.hasVaultDb
            ? 'familydata.vault.db (SQLCipher)'
            : 'SQLCipher bereit, Vault-DB fehlt'
          : 'Expo Go – Development Build erforderlich',
      },
      {
        id: 'master_key_present',
        label: CHECK_LABELS.master_key_present,
        ok: vault.hasMasterKey,
        detail: vault.hasMasterKey ? 'Keystore / Keychain Eintrag vorhanden' : 'Kein Master Key',
      },
      {
        id: 'key_binding_active',
        label: CHECK_LABELS.key_binding_active,
        ok: vault.masterKeyAuthBound,
        detail: vault.masterKeyAuthBound
          ? 'requireAuthentication / auth-bound-v2'
          : vault.hasMasterKey
            ? 'Legacy-Key – wird beim nächsten Unlock umgebunden'
            : 'Kein Key Binding',
      },
      {
        id: 'biometric_available',
        label: CHECK_LABELS.biometric_available,
        ok: bio.canAuthenticate,
        detail: bio.canAuthenticate
          ? bio.isEnrolled
            ? 'Biometrie oder Gerätecode nutzbar'
            : 'Gerätecode verfügbar'
          : 'Keine Bildschirmsperre eingerichtet',
      },
      {
        id: 'auto_lock_active',
        label: CHECK_LABELS.auto_lock_active,
        ok: Boolean(autoLock),
        detail:
          autoLock === 'immediate'
            ? 'Sofort (empfohlen)'
            : autoLock === '1'
              ? 'Nach 1 Minute'
              : autoLock === '5'
                ? 'Nach 5 Minuten'
                : 'Nach 15 Minuten',
      },
      {
        id: 'screenshot_protection',
        label: CHECK_LABELS.screenshot_protection,
        ok: screenshotOk,
        detail: screenshotOk
          ? Platform.OS === 'android'
            ? 'FLAG_SECURE aktiv'
            : 'Screen-Capture / App-Switcher Schutz aktiv'
          : 'Schutz noch nicht aktiv (App neu starten)',
      },
      {
        id: 'backup_protection',
        label: CHECK_LABELS.backup_protection,
        ok: backupOk,
        detail: backupOk
          ? Platform.OS === 'android'
            ? 'android:allowBackup=false'
            : 'iOS File Sharing deaktiviert'
          : 'Backup-Flags prüfen',
      },
      {
        id: 'no_plaintext_documents',
        label: CHECK_LABELS.no_plaintext_documents,
        ok: plaintextCount === 0,
        detail:
          plaintextCount === 0
            ? 'Keine Klartext-Anhänge erkannt'
            : `${plaintextCount} Klartext-Pfad(e) / Staging-Datei(en)`,
      },
      {
        id: 'offline_mode',
        label: CHECK_LABELS.offline_mode,
        ok: pdfOffline && !Constants.expoConfig?.extra?.cloudApiUrl,
        detail: pdfOffline
          ? 'Lokales PDF-Bundle, keine Cloud-API'
          : 'Lokales PDF-Bundle unvollständig',
      },
    ];

    const passed = checks.filter((c) => c.ok).length;
    const total = checks.length;
    const score = this.getSecurityScore(checks);
    const recommendations = this.getSecurityRecommendations(checks);
    const status: SecurityCheckReport['status'] =
      recommendations.length === 0 && passed === total ? 'Sehr gut' : 'Hinweise vorhanden';

    return {
      checks,
      passed,
      total,
      score,
      status,
      recommendations,
      ranAt: new Date().toISOString(),
    };
  },

  getSecurityScore(checks?: SecurityCheckResult[]): number {
    if (!checks?.length) return 0;
    const weights: Partial<Record<SecurityCheckId, number>> = {
      encryption_active: 14,
      sqlcipher_active: 14,
      master_key_present: 12,
      key_binding_active: 12,
      biometric_available: 8,
      auto_lock_active: 8,
      screenshot_protection: 8,
      backup_protection: 8,
      no_plaintext_documents: 10,
      offline_mode: 6,
    };
    let earned = 0;
    let max = 0;
    for (const check of checks) {
      const w = weights[check.id] ?? 10;
      max += w;
      if (check.ok) earned += w;
    }
    return max === 0 ? 0 : Math.round((earned / max) * 100);
  },

  getSecurityRecommendations(checks: SecurityCheckResult[]): string[] {
    const tips: string[] = [];
    for (const check of checks) {
      if (check.ok) continue;
      switch (check.id) {
        case 'encryption_active':
        case 'sqlcipher_active':
          tips.push('Vault auf einem Development Build / der Release-APK einrichten oder migrieren.');
          break;
        case 'master_key_present':
          tips.push('FamilyData entsperren, um den Master Key zu erzeugen.');
          break;
        case 'key_binding_active':
          tips.push('App entsperren, damit der Legacy-Key an Biometrie/Gerätecode gebunden wird.');
          break;
        case 'biometric_available':
          tips.push('Unter den Systemeinstellungen Biometrie oder Gerätecode aktivieren.');
          break;
        case 'screenshot_protection':
          tips.push('App neu starten, damit der Screenshot-Schutz greift.');
          break;
        case 'backup_protection':
          tips.push('Release-Build mit allowBackup=false und Hardening-Plugin verwenden.');
          break;
        case 'no_plaintext_documents':
          tips.push('Klartext → Vault Migration ausführen bzw. Staging-Dateien entfernen.');
          break;
        case 'offline_mode':
          tips.push('App mit gebündeltem PDF.js neu bauen.');
          break;
        default:
          tips.push(check.detail);
      }
    }
    if (checks.some((c) => c.id === 'auto_lock_active' && c.ok === false)) {
      tips.push('Auto-Lock auf „Sofort“ setzen.');
    }
    return [...new Set(tips)];
  },
};

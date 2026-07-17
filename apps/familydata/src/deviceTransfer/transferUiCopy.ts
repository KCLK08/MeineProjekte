/**
 * UI-only mapping of technical transfer errors to user-facing German copy.
 * Does not change security/transfer services.
 */

const RULES: Array<{ test: RegExp; message: string }> = [
  {
    test: /abgelaufen|expired|Transfer-Fenster|Pairing-Sitzung abgelaufen/i,
    message: 'Die Verbindung ist abgelaufen. Bitte starte die Übertragung erneut.',
  },
  {
    test: /Entschlüsselung fehlgeschlagen|falscher Key|Manipulation|AEAD|Replay|Sequenz/i,
    message:
      'Die Geräte konnten nicht verbunden werden. Prüfe, ob beide Geräte im gleichen WLAN sind.',
  },
  {
    test: /Kanal nicht verbunden|nicht verbunden|Verbindung verloren|Verbindungsfehler|connect\(\)/i,
    message:
      'Die Geräte konnten nicht verbunden werden. Prüfe, ob beide Geräte im gleichen WLAN sind.',
  },
  {
    test: /Bestätigungscode|SAS|confirmSas|Pairing unvollständig|Session-Material/i,
    message: 'Bitte vergleiche zuerst den Sicherheitscode auf beiden Geräten.',
  },
  {
    test: /QR|Manifest|Schema|ungültig|abgelehnt/i,
    message: 'Der Code konnte nicht gelesen werden. Bitte erneut scannen.',
  },
  {
    test: /Speicherplatz|Nicht genug Speicher|Speicher voll|ENOSPC|disk (full|space)/i,
    message:
      'Nicht genügend Speicher verfügbar. Bitte gib Speicher frei und versuche es erneut.',
  },
  {
    test: /Tresor|gesperrt|Authentifizierung|Biometrie|Master-Key nicht freigegeben/i,
    message: 'Die Freigabe war nicht möglich. Bitte erneut mit Biometrie oder Gerätecode bestätigen.',
  },
  {
    test: /Cutover|Migration|Staging|Commit/i,
    message: 'Die Einrichtung auf dem neuen Gerät ist fehlgeschlagen. Bitte starte die Übertragung erneut.',
  },
];

export function friendlyTransferError(
  raw: unknown,
  fallback = 'Etwas ist schiefgelaufen. Bitte versuche es erneut.'
): string {
  const text = typeof raw === 'string' ? raw : (raw as Error)?.message || '';
  if (!text.trim()) return fallback;
  for (const rule of RULES) {
    if (rule.test.test(text)) return rule.message;
  }
  // Avoid leaking low-level jargon in the UI.
  if (/HKDF|X25519|AES|TCP|SQLCipher|PRAGMA|HMAC|docWrap|integrityKey/i.test(text)) {
    return fallback;
  }
  if (text.length > 160) return fallback;
  return text;
}

/** Formats an 8-char SAS as "ABCD 1234" for display. */
export function formatSecurityCode(code: string | null | undefined): string {
  const clean = (code || '').replace(/\s+/g, '').toUpperCase();
  if (clean.length >= 8) return `${clean.slice(0, 4)} ${clean.slice(4, 8)}`;
  return clean || '—';
}

const TECH_PROGRESS =
  /SQLCipher|Master.?Key|Staging|Phase\s*\d|HKDF|Vault|Chunk|AES|TCP|Cutover|PRAGMA|docWrap/i;

/** Hide technical progress strings from the product UI. */
export function friendlyProgressLine(raw: string | null | undefined, fallback: string): string {
  const text = (raw || '').trim();
  if (!text || TECH_PROGRESS.test(text)) return fallback;
  return text;
}

const LONG_DOCS_HINT =
  'Dokumente werden übertragen. Die Übertragung kann bei vielen Dokumenten einige Minuten dauern.';

/**
 * Document-step detail from real counts only (no invented totals/bytes).
 */
export function formatDocumentTransferDetail(args: {
  phase: string;
  progress: string;
  sentCount: number;
  receivedCount: number;
  expectedTotal?: number | null;
}): string | undefined {
  const active = args.phase === 'sending' || args.phase === 'receiving';
  if (!active) return undefined;

  const ratio = args.progress.match(/(\d+)\s*\/\s*(\d+)/);
  if (ratio) {
    const current = Number(ratio[1]);
    const total = Number(ratio[2]);
    if (total > 0) {
      return `Dokumente werden übertragen · ${current} von ${total} Dokumenten`;
    }
  }

  const total =
    typeof args.expectedTotal === 'number' && args.expectedTotal > 0 ? args.expectedTotal : null;
  if (args.phase === 'sending' && total) {
    return `Dokumente werden übertragen · ${args.sentCount} von ${total} Dokumenten`;
  }
  if (args.phase === 'receiving' && total) {
    return `Dokumente werden übertragen · ${args.receivedCount} von ${total} Dokumenten`;
  }
  if (args.phase === 'sending' && args.sentCount > 0) {
    return `Dokumente werden übertragen · ${args.sentCount} Dokumente gesendet`;
  }
  if (args.phase === 'receiving' && args.receivedCount > 0) {
    return `Dokumente werden übertragen · ${args.receivedCount} Dokumente empfangen`;
  }

  return LONG_DOCS_HINT;
}

/** Keep-alive copy during long transfers (auto-lock remains active). */
export const KEEP_APP_OPEN_HINT =
  'Bitte lasse die App geöffnet. Die Übertragung läuft nur, solange FamilyData entsperrt und sichtbar bleibt.';

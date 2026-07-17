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
    message: 'Die sichere Verbindung konnte nicht hergestellt werden.',
  },
  {
    test: /Kanal nicht verbunden|nicht verbunden|Verbindung verloren|Verbindungsfehler|connect\(\)/i,
    message: 'Die Verbindung zum anderen Gerät ist unterbrochen. Bitte versuche es erneut.',
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
    test: /Speicherplatz|Nicht genug Speicher/i,
    message: 'Auf diesem Gerät ist nicht genug Speicherplatz frei.',
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

export function friendlyTransferError(raw: unknown, fallback = 'Etwas ist schiefgelaufen. Bitte versuche es erneut.'): string {
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

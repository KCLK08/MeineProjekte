import type { FamilyRole } from '@/types/models';
import { FAMILY_ROLE_OPTIONS } from '@/types/models';

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function displayName(vorname: string, nachname: string) {
  return `${vorname} ${nachname}`.trim();
}

export function initials(vorname: string, nachname: string) {
  const a = (vorname || '').trim().charAt(0);
  const b = (nachname || '').trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

/** Split "Max Muster" → vorname / nachname (last token = Nachname when multiple). */
export function splitFullName(fullName: string): { vorname: string; nachname: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { vorname: '', nachname: '' };
  if (parts.length === 1) return { vorname: parts[0], nachname: '' };
  return { vorname: parts.slice(0, -1).join(' '), nachname: parts[parts.length - 1] };
}

export function roleLabel(rolle?: string | null) {
  const found = FAMILY_ROLE_OPTIONS.find((r) => r.id === rolle);
  return found?.label || '';
}

export function isFamilyRole(value: string): value is FamilyRole {
  return FAMILY_ROLE_OPTIONS.some((r) => r.id === value);
}

/** Display / input as DD-MM-YYYY. Accepts ISO YYYY-MM-DD storage. */
export function formatDateDe(value?: string | null) {
  if (!value) return '—';
  const iso = toIsoDate(value);
  if (!iso) return value;
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/** Parse DD-MM-YYYY / DD.MM.YYYY / YYYY-MM-DD → YYYY-MM-DD or null. */
export function parseDateDe(input?: string | null): string | null {
  if (!input?.trim()) return null;
  const raw = input.trim();
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return isValidYmd(+isoMatch[1], +isoMatch[2], +isoMatch[3]) ? raw : null;
  }
  const deMatch = raw.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})$/);
  if (!deMatch) return null;
  const d = Number(deMatch[1]);
  const m = Number(deMatch[2]);
  const y = Number(deMatch[3]);
  if (!isValidYmd(y, m, d)) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function toIsoDate(value: string): string | null {
  return parseDateDe(value);
}

function isValidYmd(y: number, m: number, d: number) {
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}

export function isExpiringSoon(expiryDate?: string | null, days = 90) {
  if (!expiryDate) return false;
  const iso = toIsoDate(expiryDate) || expiryDate;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  const diff = d.getTime() - Date.now();
  return diff >= 0 && diff <= days * 24 * 60 * 60 * 1000;
}

export function isExpired(expiryDate?: string | null) {
  if (!expiryDate) return false;
  const iso = toIsoDate(expiryDate) || expiryDate;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return d.getTime() < Date.now();
}

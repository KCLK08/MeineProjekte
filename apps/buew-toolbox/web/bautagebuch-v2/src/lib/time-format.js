function formatTime(hours, minutes) {
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function normalizeClockTime(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) {
    return '';
  }

  if (/^\d{1,2}$/.test(normalized)) {
    return formatTime(Number(normalized), 0) || normalized;
  }
  if (/^\d{3}$/.test(normalized)) {
    const hours = Number(normalized.slice(0, 1));
    const minutes = Number(normalized.slice(1));
    return formatTime(hours, minutes) || normalized;
  }
  if (/^\d{4}$/.test(normalized)) {
    const hours = Number(normalized.slice(0, 2));
    const minutes = Number(normalized.slice(2));
    return formatTime(hours, minutes) || normalized;
  }

  const match = normalized.match(/^(\d{1,2})\s*[:.,]\s*(\d{0,2})$/);
  if (match) {
    const hours = Number(match[1]);
    const rawMinutes = String(match[2] || '');
    const minutes = rawMinutes ? Number(rawMinutes.padStart(2, '0')) : 0;
    return formatTime(hours, minutes) || normalized;
  }

  return normalized;
}

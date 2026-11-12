/**
 * Fixed Date and Time Formatter for AnswerDesk.
 *
 * Guarantees 100% identical SSR and Client hydration output by enforcing:
 * 1. Fixed Locale: 'en-IN'
 * 2. Fixed Timezone: 'Asia/Kolkata' (IST, UTC+5:30)
 *
 * Prevents hydration mismatches where server and client run under different OS locales or timezones.
 */

const FIXED_LOCALE = 'en-IN';
const FIXED_TIMEZONE = 'Asia/Kolkata';

const dateFormatter = new Intl.DateTimeFormat(FIXED_LOCALE, {
  timeZone: FIXED_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat(FIXED_LOCALE, {
  timeZone: FIXED_TIMEZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat(FIXED_LOCALE, {
  timeZone: FIXED_TIMEZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

const timeFormatter = new Intl.DateTimeFormat(FIXED_LOCALE, {
  timeZone: FIXED_TIMEZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
});

function toValidDate(value: Date | string | number | null | undefined): Date | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Formats date as e.g. "07 Nov 2026" in Asia/Kolkata timezone.
 */
export function formatDate(value: Date | string | number | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return '—';
  return dateFormatter.format(d);
}

/**
 * Formats date as "07/11/2026" (DD/MM/YYYY) in Asia/Kolkata timezone.
 */
export function formatShortDate(value: Date | string | number | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return '—';
  return shortDateFormatter.format(d);
}

/**
 * Formats date and time as e.g. "07 Nov 2026, 08:45 pm" in Asia/Kolkata timezone.
 */
export function formatDateTime(value: Date | string | number | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return '—';
  return dateTimeFormatter.format(d);
}

/**
 * Formats time as e.g. "08:45 pm" in Asia/Kolkata timezone.
 */
export function formatTime(value: Date | string | number | null | undefined): string {
  const d = toValidDate(value);
  if (!d) return '—';
  return timeFormatter.format(d);
}


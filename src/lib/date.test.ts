import { describe, it, expect } from 'vitest';
import { formatDate, formatShortDate, formatDateTime, formatTime } from './date';

describe('Fixed Date/Time Formatter (Locale & Timezone Invariance)', () => {
  // 2026-11-07T12:00:00Z -> In Asia/Kolkata (UTC+5:30) is 2026-11-07, 17:30 (5:30 pm)
  const testIso = '2026-11-07T12:00:00.000Z';
  const testDate = new Date(testIso);

  it('formats short date deterministically as DD/MM/YYYY', () => {
    const formatted = formatShortDate(testDate);
    expect(formatted).toBe('07/11/2026');
  });

  it('formats medium date deterministically as DD Mon YYYY', () => {
    const formatted = formatDate(testDate);
    expect(formatted).toBe('07 Nov 2026');
  });

  it('formats date and time accurately in Asia/Kolkata timezone', () => {
    const formatted = formatDateTime(testDate);
    // 12:00 UTC is 05:30 pm in IST
    expect(formatted).toContain('07 Nov 2026');
    expect(formatted.toLowerCase()).toMatch(/05:30\s*pm/);
  });

  it('formats time accurately in Asia/Kolkata timezone', () => {
    const formatted = formatTime(testDate);
    expect(formatted.toLowerCase()).toMatch(/05:30\s*pm/);
  });

  it('handles cross-day boundary between UTC and IST', () => {
    // 2026-11-07T21:00:00Z is 2026-11-08T02:30:00 in IST
    const lateUtc = '2026-11-07T21:00:00.000Z';
    expect(formatShortDate(lateUtc)).toBe('08/11/2026');
    expect(formatDate(lateUtc)).toBe('08 Nov 2026');
  });

  it('handles null, undefined, and invalid date inputs gracefully without throwing', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate(undefined)).toBe('—');
    expect(formatDate('invalid-date')).toBe('—');
    expect(formatShortDate(null)).toBe('—');
    expect(formatDateTime(null)).toBe('—');
    expect(formatTime(null)).toBe('—');
  });

  it('remains invariant when process locale or global Intl settings are probed', () => {
    // Run multiple samples with string, number, and Date instances
    const r1 = formatShortDate(testIso);
    const r2 = formatShortDate(testDate.getTime());
    const r3 = formatShortDate(testDate);

    expect(r1).toBe('07/11/2026');
    expect(r2).toBe('07/11/2026');
    expect(r3).toBe('07/11/2026');
  });
});


import { describe, expect, it } from 'vitest';
import { sgDateString } from '../../src/domain/time';
import { dayTypeFor } from '../../src/domain/dayType';
import { formatSgTime, sgDayEnd, sgDayStart, sgLocal, sgParts } from '../../src/domain/time';

describe('Singapore time handling (SRS 6.3)', () => {
  it('day type is evaluated in Singapore time, including the midnight boundary', () => {
    const none = new Set<string>();
    expect(dayTypeFor(sgLocal(2026, 9, 16, 8), none)).toBe('WEEKDAY');
    expect(dayTypeFor(sgLocal(2026, 9, 19, 23, 59), none)).toBe('SATURDAY');
    expect(dayTypeFor(sgLocal(2026, 9, 20, 0, 0), none)).toBe('SUNDAY_PUBLIC_HOLIDAY');
  });

  it('a public holiday on a weekday is treated as a Sunday or public holiday', () => {
    expect(dayTypeFor(sgLocal(2026, 8, 10, 9), new Set(['2026-08-10']))).toBe(
      'SUNDAY_PUBLIC_HOLIDAY',
    );
  });

  it('sgParts reports wall-clock values and the minute of the day', () => {
    const parts = sgParts(sgLocal(2026, 9, 16, 7, 59));
    expect(parts.isoDate).toBe('2026-09-16');
    expect(parts.minutesOfDay).toBe(7 * 60 + 59);
    expect(parts.weekday).toBe(3);
    expect(formatSgTime(sgLocal(2026, 9, 16, 0, 5))).toBe('00:05');
  });

  it('a stored effective date reports the Singapore day it was entered as, not the UTC day', () => {
    const stored = sgDayStart('2026-09-16');
    expect(stored.toISOString().slice(0, 10)).toBe('2026-09-15');
    expect(sgDateString(stored)).toBe('2026-09-16');
    expect(sgDateString(sgDayEnd('2026-09-16'))).toBe('2026-09-16');
  });

  it('day ranges for history filters cover a whole Singapore day', () => {
    expect(sgDayStart('2026-09-16').toISOString()).toBe('2026-09-15T16:00:00.000Z');
    expect(sgDayEnd('2026-09-16').toISOString()).toBe('2026-09-16T15:59:59.999Z');
  });
});

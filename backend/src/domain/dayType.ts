import type { DayType } from '@tolltally/shared';
import { sgParts } from './time';

/**
 * Weekday, Saturday, or Sunday and public holiday, in Singapore time, for ERP rate matching.
 */
export function dayTypeFor(instant: Date, holidays: ReadonlySet<string>): DayType {
  const parts = sgParts(instant);
  if (parts.weekday === 0 || holidays.has(parts.isoDate)) return 'SUNDAY_PUBLIC_HOLIDAY';
  if (parts.weekday === 6) return 'SATURDAY';
  return 'WEEKDAY';
}
